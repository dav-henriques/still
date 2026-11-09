import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AUDIO_EXTENSIONS,
  DEFAULT_CROP,
  IMAGE_EXTENSIONS,
  IdSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  extensionOf,
  stripExtension,
  uniqueStem,
  type Beat,
  type Project,
  type ProjectSummary,
  type Quality,
} from '@still/shared';
import type { Paths } from '../config.ts';
import { computePeaks, createPlaybackProxy } from '../media/audio.ts';
import { importArtwork } from '../media/artwork.ts';
import { MediaError, probeAudio } from '../media/probe.ts';
import type { EventHub } from '../services/events.ts';
import { HttpError, createKeyedLock, exists, newId, readJson, safeJoin, writeJsonAtomic } from '../storage/fs.ts';

export interface UploadedFile {
  path: string; // temp path written by multer
  originalname: string;
  size: number;
}

export interface ImportResult {
  imported: Beat[];
  failed: { filename: string; message: string; details?: string }[];
}

const now = () => new Date().toISOString();

export class ProjectStore {
  private lock = createKeyedLock();
  private peakJobs = new Map<string, Promise<number[]>>();

  constructor(
    private paths: Paths,
    private events: EventHub,
  ) {}

  dir(projectId: string): string {
    if (!IdSchema.safeParse(projectId).success) throw new HttpError(404, 'project_not_found', 'Project not found');
    return safeJoin(this.paths.projectsDir, projectId);
  }
  private file(projectId: string) {
    return path.join(this.dir(projectId), 'project.json');
  }
  audioPath(projectId: string, file: string) {
    return safeJoin(this.dir(projectId), 'audio', file);
  }
  artworkPath(projectId: string, file: string) {
    return safeJoin(this.dir(projectId), 'artwork', file);
  }
  cachePath(projectId: string, file: string) {
    return safeJoin(this.dir(projectId), 'cache', file);
  }

  async get(projectId: string): Promise<Project> {
    const raw = await readJson<unknown>(this.file(projectId)).catch((err) => {
      throw new HttpError(500, 'project_unreadable', 'This project file could not be read.', String(err));
    });
    if (raw == null) throw new HttpError(404, 'project_not_found', 'Project not found');
    const parsed = ProjectSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(500, 'project_invalid', 'This project file is damaged or from an incompatible version.', parsed.error.message);
    return parsed.data;
  }

  async list(): Promise<ProjectSummary[]> {
    await fs.mkdir(this.paths.projectsDir, { recursive: true });
    const entries = await fs.readdir(this.paths.projectsDir, { withFileTypes: true });
    const out: ProjectSummary[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !IdSchema.safeParse(e.name).success) continue;
      try {
        const p = await this.get(e.name);
        out.push(summarize(p));
      } catch (err) {
        console.warn(`[still] skipping unreadable project ${e.name}:`, (err as Error).message);
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(name: string, quality: Quality): Promise<Project> {
    const id = newId();
    const t = now();
    const project: Project = {
      schemaVersion: SCHEMA_VERSION,
      id,
      name: name.trim(),
      createdAt: t,
      updatedAt: t,
      beats: [],
      artworks: {},
      exportSettings: { quality },
    };
    await writeJsonAtomic(this.file(id), project);
    return project;
  }

  /** Locked read-modify-write. The mutator may throw HttpError to abort without writing. */
  async update(projectId: string, mutate: (p: Project) => void | Promise<void>): Promise<Project> {
    return this.lock(projectId, async () => {
      const project = await this.get(projectId);
      await mutate(project);
      project.updatedAt = now();
      const orphaned = collectOrphanArtworks(project);
      const valid = ProjectSchema.parse(project);
      await writeJsonAtomic(this.file(projectId), valid);
      await Promise.all(orphaned.map((a) => this.deleteArtworkFiles(projectId, a)));
      this.events.emit({ type: 'project', projectId });
      return valid;
    });
  }

  async remove(projectId: string): Promise<void> {
    const dir = this.dir(projectId);
    if (!(await exists(path.join(dir, 'project.json')))) throw new HttpError(404, 'project_not_found', 'Project not found');
    await this.lock(projectId, () => fs.rm(dir, { recursive: true, force: true, maxRetries: 5 }));
  }

  async duplicate(projectId: string): Promise<Project> {
    const source = await this.get(projectId);
    const id = newId();
    const names = new Set((await this.list()).map((p) => p.name));
    await fs.cp(this.dir(projectId), this.dir(id), { recursive: true, errorOnExist: true });
    const t = now();
    const copy: Project = { ...source, id, name: uniqueStem(`${source.name} copy`, (n) => names.has(n)), createdAt: t, updatedAt: t };
    await writeJsonAtomic(this.file(id), copy);
    return copy;
  }

  // ── Audio ──────────────────────────────────────────────────────

  async importAudio(projectId: string, files: UploadedFile[]): Promise<ImportResult> {
    await this.get(projectId); // 404 early
    const result: ImportResult = { imported: [], failed: [] };
    const audioDir = path.join(this.dir(projectId), 'audio');
    await fs.mkdir(audioDir, { recursive: true });

    for (const f of files) {
      const filename = f.originalname;
      const ext = extensionOf(filename);
      try {
        if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
          throw new MediaError(`“.${ext || '?'}” files aren't supported. Use WAV, MP3, FLAC, M4A, AAC, OGG or AIFF.`);
        }
        const probe = await probeAudio(f.path);
        const id = newId();
        const stored = `${id}.${ext}`;
        await fs.rename(f.path, path.join(audioDir, stored));
        let playbackFile: string | null = null;
        if (!probe.browserPlayable) {
          await fs.mkdir(path.join(this.dir(projectId), 'cache'), { recursive: true });
          playbackFile = `${id}.playback.flac`;
          await createPlaybackProxy(path.join(audioDir, stored), this.cachePath(projectId, playbackFile));
        }
        const t = now();
        result.imported.push({
          id,
          name: stripExtension(filename).trim().slice(0, 200) || 'Untitled beat',
          audio: {
            file: stored,
            originalFilename: filename,
            format: ext === 'aif' ? 'aiff' : ext,
            codec: probe.codec,
            sampleRate: probe.sampleRate,
            channels: probe.channels,
            bitRate: probe.bitRate,
            bitDepth: probe.bitDepth,
            duration: probe.duration,
            size: f.size,
            playbackFile,
          },
          artworkId: null,
          crop: { ...DEFAULT_CROP },
          createdAt: t,
          updatedAt: t,
        });
      } catch (err) {
        await fs.rm(f.path, { force: true });
        const e = err as MediaError;
        result.failed.push({ filename, message: e instanceof MediaError ? e.message : 'Import failed.', details: e.details ?? String(err) });
      }
    }

    if (result.imported.length) {
      await this.update(projectId, (p) => {
        const names = new Set(p.beats.map((b) => b.name.toLowerCase()));
        for (const beat of result.imported) {
          beat.name = uniqueStem(beat.name, (n) => names.has(n.toLowerCase()));
          names.add(beat.name.toLowerCase());
          p.beats.push(beat);
        }
      });
    }
    return result;
  }

  async removeBeats(projectId: string, beatIds: string[]): Promise<Project> {
    const removed: Beat[] = [];
    const project = await this.update(projectId, (p) => {
      const ids = new Set(beatIds);
      removed.push(...p.beats.filter((b) => ids.has(b.id)));
      p.beats = p.beats.filter((b) => !ids.has(b.id));
    });
    for (const b of removed) {
      await fs.rm(this.audioPath(projectId, b.audio.file), { force: true });
      await fs.rm(this.cachePath(projectId, `${b.id}.peaks.json`), { force: true });
      if (b.audio.playbackFile) await fs.rm(this.cachePath(projectId, b.audio.playbackFile), { force: true });
    }
    return project;
  }

  async peaks(projectId: string, beatId: string): Promise<number[]> {
    const project = await this.get(projectId);
    const beat = findBeat(project, beatId);
    const cacheFile = this.cachePath(projectId, `${beat.id}.peaks.json`);
    const cached = await readJson<number[]>(cacheFile).catch(() => null);
    if (Array.isArray(cached)) return cached;
    const key = `${projectId}/${beatId}`;
    let job = this.peakJobs.get(key);
    if (!job) {
      job = computePeaks(this.audioPath(projectId, beat.audio.file), beat.audio.duration)
        .then(async (peaks) => {
          await writeJsonAtomic(cacheFile, peaks);
          return peaks;
        })
        .finally(() => this.peakJobs.delete(key));
      this.peakJobs.set(key, job);
    }
    return job;
  }

  // ── Artwork ────────────────────────────────────────────────────

  async importArtwork(projectId: string, file: UploadedFile, beatIds: string[]): Promise<Project> {
    const ext = extensionOf(file.originalname);
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      await fs.rm(file.path, { force: true });
      throw new HttpError(400, 'unsupported_image', 'Use a PNG, JPEG or WebP image.');
    }
    const project = await this.get(projectId);
    for (const id of beatIds) findBeat(project, id);
    const id = newId();
    let imported;
    try {
      imported = await importArtwork(file.path, path.join(this.dir(projectId), 'artwork'), id, ext === 'jpeg' ? 'jpg' : ext);
    } catch (err) {
      await fs.rm(file.path, { force: true });
      throw err;
    }
    return this.update(projectId, (p) => {
      p.artworks[id] = { id, originalFilename: file.originalname, size: file.size, createdAt: now(), ...imported };
      for (const beat of p.beats) {
        if (beatIds.includes(beat.id)) {
          beat.artworkId = id;
          beat.crop = { ...DEFAULT_CROP };
          beat.updatedAt = now();
        }
      }
    });
  }

  private async deleteArtworkFiles(projectId: string, art: Project['artworks'][string]) {
    // Every file derived from an artwork is named "<artworkId>.<variant>.<ext>".
    const dir = path.join(this.dir(projectId), 'artwork');
    const all = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(all.filter((f) => f.startsWith(`${art.id}.`)).map((f) => fs.rm(safeJoin(dir, f), { force: true })));
  }
}

export function findBeat(project: Project, beatId: string): Beat {
  const beat = project.beats.find((b) => b.id === beatId);
  if (!beat) throw new HttpError(404, 'beat_not_found', 'Beat not found in this project');
  return beat;
}

/** Remove artwork records no beat references any more; returns them so files can be deleted. */
function collectOrphanArtworks(p: Project) {
  const used = new Set(p.beats.map((b) => b.artworkId).filter(Boolean));
  const orphaned = Object.values(p.artworks).filter((a) => !used.has(a.id));
  for (const a of orphaned) delete p.artworks[a.id];
  return orphaned;
}

function summarize(p: Project): ProjectSummary {
  const art: string[] = [];
  for (const b of p.beats) if (b.artworkId && !art.includes(b.artworkId) && art.length < 4) art.push(b.artworkId);
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    beatCount: p.beats.length,
    totalDuration: p.beats.reduce((s, b) => s + b.audio.duration, 0),
    artworkThumbs: art,
  };
}
