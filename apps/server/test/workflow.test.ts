/**
 * End-to-end engine tests with real media: synthetic audio and artwork are generated, imported
 * through the HTTP API, rendered by FFmpeg, and the resulting MP4 frames are decoded and inspected.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExportJob, Project } from '@still/shared';
import { createApp, createServices, type Services } from '../src/app.ts';
import { binaryPath } from '../src/media/binaries.ts';
import { probeOutput } from '../src/media/probe.ts';

let dataDir: string;
let mediaDir: string;
let services: Services;
let server: http.Server;
let base: string;

function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err))));
  });
}

async function api<T>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : undefined) as T };
}

async function upload<T>(url: string, field: string, files: string[], extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  for (const f of files) form.append(field, new Blob([await fs.readFile(f)]), path.basename(f));
  const res = await fetch(base + url, { method: 'POST', body: form });
  return { status: res.status, data: (await res.json()) as T };
}

async function waitForJob(id: string, until: (j: ExportJob) => boolean, timeoutMs = 90_000): Promise<ExportJob> {
  const t0 = Date.now();
  for (;;) {
    const { data } = await api<ExportJob>('GET', `/api/exports/${id}`);
    if (until(data)) return data;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for job, last state ${data.state}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Decode one frame of a video to raw RGB. */
async function frameAt(file: string, t: number) {
  const buf = await run(binaryPath('ffmpeg'), ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  expect(buf.length).toBe(1920 * 1080 * 3);
  return (x: number, y: number) => {
    const i = (y * 1920 + x) * 3;
    return [buf[i]!, buf[i + 1]!, buf[i + 2]!] as const;
  };
}

const near = (px: readonly number[], rgb: number[], tol = 28) => px.every((v, i) => Math.abs(v - rgb[i]!) <= tol);
const RED = [230, 30, 30];
const GREEN = [30, 200, 60];
const BLUE = [30, 60, 230];

async function startServer(dir: string) {
  services = await createServices(dir);
  server = createApp(services).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function stopServer() {
  services.events.closeAll();
  await services.exportsQueue.shutdown();
  await new Promise((r) => server.close(r));
}

beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'still-data-'));
  mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'still-media-'));
  await startServer(dataDir);
  const ff = binaryPath('ffmpeg');
  // Original synthetic audio (no copyrighted material).
  await run(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3.5', '-ac', '2', '-ar', '44100', path.join(mediaDir, 'Test Beat: One.wav')]);
  await run(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=90', '-ac', '2', path.join(mediaDir, 'Long.flac')]);
  await fs.writeFile(path.join(mediaDir, 'broken.mp3'), 'definitely not audio');
  // 1600×1000 artwork: three vertical bands red | green | blue, each 1600/3 wide.
  const band = (rgb: number[]) => sharp({ create: { width: 534, height: 1000, channels: 3, background: { r: rgb[0]!, g: rgb[1]!, b: rgb[2]! } } }).png().toBuffer();
  await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#000' } })
    .composite([
      { input: await band(RED), left: 0, top: 0 },
      { input: await band(GREEN), left: 533, top: 0 },
      { input: await band(BLUE), left: 1066, top: 0 },
    ])
    .png()
    .toFile(path.join(mediaDir, 'bands.png'));
});

afterAll(async () => {
  await stopServer();
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(mediaDir, { recursive: true, force: true });
});

describe('full workflow', () => {
  let project: Project;
  let beatId: string;
  let longId: string;

  it('reports FFmpeg and FFprobe availability', async () => {
    const { data } = await api<{ ready: boolean; ffmpeg: { version: string } }>('GET', '/api/system');
    expect(data.ready).toBe(true);
    expect(data.ffmpeg.version).toBeTruthy();
  });

  it('creates, renames, duplicates and deletes projects', async () => {
    const created = await api<Project>('POST', '/api/projects', { name: 'YouTube Beats' });
    expect(created.status).toBe(201);
    project = created.data;
    expect((await api<Project>('PATCH', `/api/projects/${project.id}`, { name: 'YouTube Beats 2' })).data.name).toBe('YouTube Beats 2');
    const dup = await api<Project>('POST', `/api/projects/${project.id}/duplicate`);
    expect(dup.data.name).toBe('YouTube Beats 2 copy');
    expect((await api<unknown[]>('GET', '/api/projects')).data).toHaveLength(2);
    expect((await api('DELETE', `/api/projects/${dup.data.id}`)).status).toBe(204);
    expect((await api<unknown[]>('GET', '/api/projects')).data).toHaveLength(1);
    expect((await api('POST', '/api/projects', { name: '   ' })).status).toBe(400);
  });

  it('imports audio with real metadata and rejects bad files individually', async () => {
    const res = await upload<{ imported: Project['beats']; failed: { filename: string }[] }>(`/api/projects/${project.id}/audio`, 'files', [
      path.join(mediaDir, 'Test Beat: One.wav'),
      path.join(mediaDir, 'Long.flac'),
      path.join(mediaDir, 'broken.mp3'),
    ]);
    expect(res.status).toBe(201);
    expect(res.data.imported).toHaveLength(2);
    expect(res.data.failed.map((f) => f.filename)).toEqual(['broken.mp3']);
    const beat = res.data.imported[0]!;
    expect(beat.name).toBe('Test Beat: One');
    expect(beat.audio.duration).toBeCloseTo(3.5, 2);
    expect(beat.audio.sampleRate).toBe(44100);
    expect(beat.audio.channels).toBe(2);
    beatId = beat.id;
    longId = res.data.imported[1]!.id;
    // Original preserved byte-for-byte.
    const stored = path.join(dataDir, 'projects', project.id, 'audio', beat.audio.file);
    expect(Buffer.compare(await fs.readFile(stored), await fs.readFile(path.join(mediaDir, 'Test Beat: One.wav')))).toBe(0);
  });

  it('serves waveform peaks derived from the audio', async () => {
    const { data } = await api<number[]>('GET', `/api/projects/${project.id}/media/peaks/${beatId}`);
    expect(data.length).toBeGreaterThan(100);
    expect(Math.max(...data)).toBeCloseTo(0.125, 2); // lavfi sine is generated at amplitude 1/8
  });

  it('refuses to export a beat without artwork', async () => {
    const res = await api<{ error: { code: string } }>('POST', `/api/projects/${project.id}/exports`, { beatIds: [beatId], quality: 'standard' });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe('missing_artwork');
  });

  it('assigns artwork and persists crop across a restart', async () => {
    const res = await upload<Project>(`/api/projects/${project.id}/artwork`, 'file', [path.join(mediaDir, 'bands.png')], {
      beatIds: JSON.stringify([beatId, longId]),
    });
    expect(res.status).toBe(201);
    const art = Object.values(res.data.artworks)[0]!;
    expect([art.width, art.height]).toEqual([1600, 1000]);
    expect(res.data.beats.every((b) => b.artworkId === art.id)).toBe(true);

    const patched = await api<Project>('PATCH', `/api/projects/${project.id}/beats/${beatId}`, { crop: { zoom: 1, x: 0, y: 0.5 } });
    expect(patched.data.beats[0]!.crop).toEqual({ zoom: 1, x: 0, y: 0.5 });
    expect((await api('PATCH', `/api/projects/${project.id}/beats/${beatId}`, { crop: { zoom: 99, x: 0, y: 0 } })).status).toBe(400);

    await stopServer();
    await startServer(dataDir);
    const reopened = await api<Project>('GET', `/api/projects/${project.id}`);
    expect(reopened.data.beats.find((b) => b.id === beatId)!.crop).toEqual({ zoom: 1, x: 0, y: 0.5 });
    expect(reopened.data.beats.find((b) => b.id === longId)!.crop).toEqual({ zoom: 1, x: 0.5, y: 0.5 });
  });

  it('renders a verified 1920×1080 MP4 whose pixels match the crop', async () => {
    const { data: jobs } = await api<ExportJob[]>('POST', `/api/projects/${project.id}/exports`, { beatIds: [beatId], quality: 'high' });
    const progress: number[] = [];
    const done = await waitForJob(jobs[0]!.id, (j) => {
      progress.push(j.progress);
      return j.state === 'completed' || j.state === 'failed';
    });
    expect(done.error).toBeNull();
    expect(done.state).toBe('completed');
    expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
    const out = done.output!;
    expect(out.filename).toBe('Test Beat One.mp4'); // ':' sanitized
    expect(path.dirname(out.path)).toBe(path.join(dataDir, 'exports', 'YouTube Beats 2'));

    const probe = await probeOutput(out.path);
    expect(probe.video).toEqual({ codec: 'h264', width: 1920, height: 1080 });
    expect(probe.audio?.codec).toBe('aac');
    expect(Math.abs(probe.duration - 3.5)).toBeLessThan(0.1);

    // crop x=0: the square shows source columns 0..1000 → red until 53.3%, then green.
    for (const t of [0.5, 3.0]) {
      const px = await frameAt(out.path, t);
      for (const y of [5, 540, 1074]) {
        expect(near(px(10, y), [0, 0, 0], 3), 'left bar black').toBe(true);
        expect(near(px(415, y), [0, 0, 0], 6), 'left bar edge black').toBe(true);
        expect(near(px(1505, y), [0, 0, 0], 6), 'right bar edge black').toBe(true);
        expect(near(px(1910, y), [0, 0, 0], 3), 'right bar black').toBe(true);
        expect(near(px(420 + 270, y), RED), 'artwork 25% red').toBe(true);
        expect(near(px(420 + 810, y), GREEN), 'artwork 75% green').toBe(true);
      }
      // Artwork touches top and bottom edges.
      expect(near(px(700, 0), RED)).toBe(true);
      expect(near(px(700, 1079), RED)).toBe(true);
    }
  });

  it('centers the artwork by default', async () => {
    await api('PATCH', `/api/projects/${project.id}/beats/${beatId}`, { crop: { zoom: 1, x: 0.5, y: 0.5 } });
    const { data: jobs } = await api<ExportJob[]>('POST', `/api/projects/${project.id}/exports`, { beatIds: [beatId], quality: 'standard' });
    const done = await waitForJob(jobs[0]!.id, (j) => j.state === 'completed' || j.state === 'failed');
    expect(done.output!.filename).toBe('Test Beat One (2).mp4'); // no overwrite
    // Centered window 300..1300: red to 23.3%, green to 76.7%, then blue.
    const px = await frameAt(done.output!.path, 1);
    expect(near(px(420 + 108, 540), RED)).toBe(true);
    expect(near(px(420 + 540, 540), GREEN)).toBe(true);
    expect(near(px(420 + 972, 540), BLUE)).toBe(true);
    expect(near(px(200, 540), [0, 0, 0], 3)).toBe(true);
    expect(near(px(1720, 540), [0, 0, 0], 3)).toBe(true);
  });

  it('cancels a running render without leaving an output behind', async () => {
    const { data: jobs } = await api<ExportJob[]>('POST', `/api/projects/${project.id}/exports`, { beatIds: [longId], quality: 'maximum' });
    const running = await waitForJob(jobs[0]!.id, (j) => j.state === 'rendering' || j.state === 'completed');
    expect(running.state).toBe('rendering');
    const tempPath = running.tempPath!;
    await api('POST', `/api/exports/${running.id}/cancel`);
    const cancelled = await waitForJob(running.id, (j) => j.state !== 'rendering');
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.output).toBeNull();
    await expect(fs.access(tempPath)).rejects.toThrow();
    const files = await fs.readdir(path.join(dataDir, 'exports', 'YouTube Beats 2'));
    expect(files.some((f) => f.startsWith('Long'))).toBe(false);
    expect(files.some((f) => f.includes('partial'))).toBe(false);

    const retried = await api<ExportJob>('POST', `/api/exports/${running.id}/retry`);
    expect(['queued', 'preparing']).toContain(retried.data.state); // the idle queue picks it up immediately
    await api('POST', `/api/exports/${running.id}/cancel`);
    expect((await waitForJob(running.id, (j) => j.state === 'cancelled')).state).toBe('cancelled');
  });

  it('keeps export history across restarts', async () => {
    const before = (await api<ExportJob[]>('GET', `/api/projects/${project.id}/exports`)).data;
    await stopServer();
    await startServer(dataDir);
    const after = (await api<ExportJob[]>('GET', `/api/projects/${project.id}/exports`)).data;
    expect(after.map((j) => [j.id, j.state])).toEqual(before.map((j) => [j.id, j.state]));
  });

  it('rejects cross-origin and non-local requests', async () => {
    const res = await fetch(base + '/api/projects', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
    expect(res.status).toBe(403);
    const status = await new Promise<number>((resolve) => {
      const u = new URL(base);
      http.get({ host: u.hostname, port: u.port, path: '/api/health', headers: { Host: 'attacker.example' } }, (r) => resolve(r.statusCode ?? 0));
    });
    expect(status).toBe(403);
    expect((await api('GET', '/api/projects/..%2F..%2Fetc')).status).toBe(404);
  });
});
