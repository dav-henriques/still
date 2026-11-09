import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ExportJobSchema,
  VIDEO,
  canTransition,
  isActiveState,
  sanitizeFilename,
  type ExportJob,
  type JobState,
  type Quality,
} from '@still/shared';
import { z } from 'zod';
import type { Paths } from '../config.ts';
import { prepareSquare } from '../media/artwork.ts';
import { MissingBinaryError } from '../media/binaries.ts';
import { MediaError, probeOutput } from '../media/probe.ts';
import { RenderCancelled, RenderError, renderVideo } from '../media/render.ts';
import { findBeat, type ProjectStore } from '../projects/store.ts';
import type { EventHub } from '../services/events.ts';
import type { SettingsStore } from '../services/settings.ts';
import { HttpError, exists, newId, readJson, writeJsonAtomic } from '../storage/fs.ts';

const now = () => new Date().toISOString();
const MAX_HISTORY = 500;

class JobFailure extends Error {
  constructor(
    message: string,
    public details: string | null = null,
  ) {
    super(message);
  }
}

/** Duration tolerance: AAC priming/padding and frame alignment add a few tens of ms. */
export function durationAcceptable(source: number, output: number): boolean {
  return Math.abs(output - source) <= Math.max(0.25, source * 0.005);
}

/** Reserve "<stem>.mp4" (or "<stem> (n).mp4") atomically with an exclusive create. */
export async function reserveOutputPath(dir: string, stem: string): Promise<string> {
  for (let i = 1; i < 10_000; i++) {
    const candidate = path.join(dir, `${i === 1 ? stem : `${stem} (${i})`}.mp4`);
    try {
      const fh = await fs.open(candidate, 'wx');
      await fh.close();
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new JobFailure('Could not find a free filename in the output folder.');
}

export class ExportQueue {
  private jobs = new Map<string, ExportJob>();
  private running = new Map<string, AbortController>();
  private writeChain: Promise<void> = Promise.resolve();
  private lastEmit = new Map<string, number>();

  constructor(
    private paths: Paths,
    private projects: ProjectStore,
    private settings: SettingsStore,
    private events: EventHub,
    private concurrency = 1,
  ) {}

  /** Load history; anything that was mid-render when the app stopped is reported as interrupted. */
  async load(): Promise<void> {
    const raw = await readJson<unknown[]>(this.paths.jobsFile).catch(() => null);
    const parsed = z.array(ExportJobSchema).safeParse(raw ?? []);
    if (!parsed.success) console.warn('[still] export history unreadable; starting fresh');
    for (const job of parsed.success ? parsed.data : []) {
      if (job.state === 'preparing' || job.state === 'rendering') {
        if (job.tempPath) await fs.rm(job.tempPath, { force: true }).catch(() => undefined);
        Object.assign(job, {
          state: 'failed' satisfies JobState,
          tempPath: null,
          finishedAt: now(),
          error: { message: 'Interrupted — still was closed while this video was rendering.', details: null },
        });
      }
      this.jobs.set(job.id, job);
    }
    await this.persist();
    this.pump();
  }

  list(projectId?: string): ExportJob[] {
    const all = [...this.jobs.values()];
    return projectId ? all.filter((j) => j.projectId === projectId) : all;
  }

  get(id: string): ExportJob {
    const job = this.jobs.get(id);
    if (!job) throw new HttpError(404, 'export_not_found', 'Export not found');
    return job;
  }

  async enqueue(projectId: string, beatIds: string[], quality: Quality): Promise<ExportJob[]> {
    const project = await this.projects.get(projectId);
    const beats = beatIds.map((id) => findBeat(project, id));
    const missing = beats.filter((b) => !b.artworkId);
    if (missing.length) {
      throw new HttpError(400, 'missing_artwork', `${missing.length} beat${missing.length > 1 ? 's need' : ' needs'} artwork before exporting.`, missing.map((b) => b.name).join(', '));
    }
    const created: ExportJob[] = [];
    for (const beat of beats) {
      // Don't queue the same beat twice while it's still in flight.
      const inFlight = this.list(projectId).find((j) => j.beatId === beat.id && isActiveState(j.state));
      if (inFlight) continue;
      const job: ExportJob = {
        id: newId(),
        projectId,
        beatId: beat.id,
        projectName: project.name,
        beatName: beat.name,
        artworkId: beat.artworkId,
        quality,
        state: 'queued',
        progress: 0,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        tempPath: null,
        error: null,
        output: null,
      };
      this.jobs.set(job.id, job);
      created.push(job);
      this.events.emit({ type: 'job', job });
    }
    this.trimHistory();
    await this.persist();
    this.pump();
    return created;
  }

  async cancel(id: string): Promise<ExportJob> {
    const job = this.get(id);
    if (!isActiveState(job.state)) throw new HttpError(409, 'not_active', 'This export is not running.');
    const controller = this.running.get(id);
    if (controller) controller.abort(); // the worker settles the state
    else this.transition(job, 'cancelled', { finishedAt: now() });
    await this.persist();
    return job;
  }

  async cancelQueued(projectId?: string): Promise<number> {
    let n = 0;
    for (const job of this.list(projectId)) {
      if (job.state === 'queued') {
        this.transition(job, 'cancelled', { finishedAt: now() });
        n++;
      }
    }
    await this.persist();
    return n;
  }

  /** Cancel everything for a project (used when the project is deleted). */
  async cancelProject(projectId: string): Promise<void> {
    await this.cancelQueued(projectId);
    for (const job of this.list(projectId)) this.running.get(job.id)?.abort();
  }

  async retry(id: string): Promise<ExportJob> {
    const job = this.get(id);
    if (job.state !== 'failed' && job.state !== 'cancelled') throw new HttpError(409, 'not_retryable', 'Only failed or cancelled exports can be retried.');
    this.transition(job, 'queued', { progress: 0, error: null, startedAt: null, finishedAt: null, output: null });
    await this.persist();
    this.pump();
    return job;
  }

  async remove(id: string): Promise<void> {
    const job = this.get(id);
    if (isActiveState(job.state)) throw new HttpError(409, 'still_active', 'Cancel this export before removing it.');
    this.jobs.delete(id);
    this.events.emit({ type: 'job-removed', jobId: id });
    await this.persist();
  }

  async clearFinished(state: 'completed' | 'failed' | 'all'): Promise<number> {
    let n = 0;
    for (const job of [...this.jobs.values()]) {
      if (isActiveState(job.state)) continue;
      if (state === 'all' || job.state === state || (state === 'failed' && job.state === 'cancelled')) {
        this.jobs.delete(job.id);
        this.events.emit({ type: 'job-removed', jobId: job.id });
        n++;
      }
    }
    await this.persist();
    return n;
  }

  /** Stop all renders (shutdown). Their temp files are removed by the workers. */
  async shutdown(): Promise<void> {
    for (const c of this.running.values()) c.abort();
    await this.writeChain;
  }

  // ── internals ──────────────────────────────────────────────────

  private transition(job: ExportJob, to: JobState, patch: Partial<ExportJob> = {}) {
    if (!canTransition(job.state, to)) throw new Error(`Illegal export transition ${job.state} → ${to}`);
    Object.assign(job, patch, { state: to });
    this.events.emit({ type: 'job', job });
  }

  private persist(): Promise<void> {
    const snapshot = [...this.jobs.values()];
    this.writeChain = this.writeChain
      .then(() => writeJsonAtomic(this.paths.jobsFile, snapshot))
      .catch((err) => console.error('[still] failed to save export history', err));
    return this.writeChain;
  }

  private trimHistory() {
    const finished = [...this.jobs.values()].filter((j) => !isActiveState(j.state));
    for (const j of finished.slice(0, Math.max(0, this.jobs.size - MAX_HISTORY))) this.jobs.delete(j.id);
  }

  private pump() {
    for (const job of this.jobs.values()) {
      if (this.running.size >= this.concurrency) return;
      if (job.state !== 'queued' || this.running.has(job.id)) continue;
      const controller = new AbortController();
      this.running.set(job.id, controller);
      void this.process(job, controller.signal).finally(() => {
        this.running.delete(job.id);
        void this.persist();
        this.pump();
      });
    }
  }

  private emitProgress(job: ExportJob) {
    const t = Date.now();
    if (t - (this.lastEmit.get(job.id) ?? 0) < 150) return;
    this.lastEmit.set(job.id, t);
    this.events.emit({ type: 'job', job });
  }

  private async process(job: ExportJob, signal: AbortSignal): Promise<void> {
    const squarePath = path.join(this.paths.tempDir, `${job.id}.square.png`);
    const segmentPath = path.join(this.paths.tempDir, `${job.id}.segment.mp4`);
    let finalPath: string | null = null;
    try {
      this.transition(job, 'preparing', { startedAt: now(), progress: 0 });
      await this.persist();

      // 1–3. Validate assets and resolve the crop from the project as it is *now*.
      const project = await this.projects.get(job.projectId).catch(() => {
        throw new JobFailure('The project for this export no longer exists.');
      });
      const beat = project.beats.find((b) => b.id === job.beatId);
      if (!beat) throw new JobFailure('This beat was removed from the project.');
      const art = beat.artworkId ? project.artworks[beat.artworkId] : undefined;
      if (!art) throw new JobFailure('This beat has no artwork. Assign an image and retry.');
      job.beatName = beat.name;
      job.projectName = project.name;
      job.artworkId = art.id;
      const audioFile = this.projects.audioPath(project.id, beat.audio.file);
      const artFile = this.projects.artworkPath(project.id, art.file);
      if (!(await exists(audioFile))) throw new JobFailure('The audio file for this beat is missing from the project folder.');
      if (!(await exists(artFile))) throw new JobFailure('The artwork file for this beat is missing from the project folder.');

      // 4. Prepare the exact 1080×1080 square.
      await fs.mkdir(this.paths.tempDir, { recursive: true });
      await prepareSquare(artFile, art.width, art.height, beat.crop, squarePath).catch((err) => {
        throw new JobFailure('The artwork could not be prepared.', String(err));
      });
      if (signal.aborted) throw new RenderCancelled();

      // Output: <base>/<project>/<beat>.mp4, rendered to a hidden partial file next to it.
      const outDir = path.join(this.settings.outputBase(), sanitizeFilename(project.name, 'still exports'));
      await fs.mkdir(outDir, { recursive: true }).catch((err) => {
        throw new JobFailure('The output folder could not be created.', String(err));
      });
      job.tempPath = path.join(outDir, `.still-${job.id}.partial.mp4`);
      this.transition(job, 'rendering');
      await this.persist();

      // 5–7. Encode with real progress.
      await renderVideo(
        {
          artworkPng: squarePath,
          audioFile,
          audioCodec: beat.audio.codec,
          segmentPath,
          duration: beat.audio.duration,
          sampleRate: beat.audio.sampleRate,
          quality: job.quality,
          output: job.tempPath,
        },
        {
          signal,
          onProgress: (f) => {
            job.progress = Math.min(0.99, f);
            this.emitProgress(job);
          },
        },
      );

      // 8. Verify before anyone sees it as done.
      const out = await probeOutput(job.tempPath).catch((err) => {
        throw new JobFailure('The rendered file could not be verified.', String(err));
      });
      const problems: string[] = [];
      if (!out.formatName.includes('mp4')) problems.push(`container ${out.formatName}`);
      if (!out.video || out.video.codec !== 'h264') problems.push('missing H.264 video stream');
      else if (out.video.width !== VIDEO.width || out.video.height !== VIDEO.height) problems.push(`video is ${out.video.width}×${out.video.height}`);
      if (!out.audio || out.audio.codec !== 'aac') problems.push('missing AAC audio stream');
      if (!durationAcceptable(beat.audio.duration, out.duration)) problems.push(`duration ${out.duration.toFixed(2)}s vs source ${beat.audio.duration.toFixed(2)}s`);
      if (problems.length) throw new JobFailure('The rendered video did not pass verification.', problems.join('; '));

      // 9. Move into place under a unique name.
      finalPath = await reserveOutputPath(outDir, sanitizeFilename(beat.name, 'beat'));
      await fs.rename(job.tempPath, finalPath);
      const stat = await fs.stat(finalPath);
      this.transition(job, 'completed', {
        progress: 1,
        finishedAt: now(),
        tempPath: null,
        output: { path: finalPath, filename: path.basename(finalPath), size: stat.size, duration: out.duration },
      });
    } catch (err) {
      if (job.tempPath) await fs.rm(job.tempPath, { force: true }).catch(() => undefined);
      if (finalPath && job.state !== 'completed') await fs.rm(finalPath, { force: true }).catch(() => undefined);
      job.tempPath = null;
      if (err instanceof RenderCancelled || signal.aborted) {
        if (canTransition(job.state, 'cancelled')) this.transition(job, 'cancelled', { finishedAt: now() });
      } else if (canTransition(job.state, 'failed')) {
        const e = err as Error & { details?: string | null };
        const known = err instanceof JobFailure || err instanceof RenderError || err instanceof MediaError || err instanceof MissingBinaryError;
        if (!known) console.error('[still] export failed unexpectedly', err);
        const isDisk = /ENOSPC/.test(String(e.message)) || (err as NodeJS.ErrnoException).code === 'ENOSPC';
        this.transition(job, 'failed', {
          finishedAt: now(),
          error: {
            message: isDisk ? 'Not enough disk space to write the video.' : known ? e.message : 'Something went wrong while exporting.',
            details: e.details ?? (known ? null : String(err)),
          },
        });
      }
    } finally {
      await fs.rm(squarePath, { force: true }).catch(() => undefined);
      await fs.rm(segmentPath, { force: true }).catch(() => undefined);
      this.lastEmit.delete(job.id);
    }
  }
}
