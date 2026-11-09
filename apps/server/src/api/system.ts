import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { APP_VERSION, UpdateSettingsBody, isActiveState, type SystemStatus } from '@still/shared';
import type { Services } from '../app.ts';
import { detectBinaries } from '../media/binaries.ts';
import { hostMachineOnly } from '../middleware/security.ts';
import { openFolder, pickFolder } from '../services/os.ts';
import { HttpError, dirSize } from '../storage/fs.ts';
import { parse } from './validate.ts';

export function systemRouter({ paths, settings, exportsQueue }: Services) {
  const r = Router();

  async function status(force = false): Promise<SystemStatus> {
    const s = settings.get();
    const bins = await detectBinaries(s, force);
    return {
      ...bins,
      ready: bins.ffmpeg.available && bins.ffprobe.available,
      dataDir: paths.dataDir,
      projectsDir: paths.projectsDir,
      exportsDir: paths.exportsDir,
      outputDir: settings.outputBase(),
      tempDir: paths.tempDir,
      tempBytes: await dirSize(paths.tempDir),
      platform: process.platform,
      version: APP_VERSION,
    };
  }

  r.get('/health', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION });
  });

  r.get('/system', async (req, res) => {
    res.json(await status(req.query.refresh === '1'));
  });

  r.get('/settings', (_req, res) => {
    res.json(settings.get());
  });

  r.patch('/settings', async (req, res) => {
    const patch = parse(UpdateSettingsBody, req.body);
    const next = await settings.update(patch);
    if (patch.ffmpegPath !== undefined || patch.ffprobePath !== undefined) await detectBinaries(next, true);
    res.json(next);
  });

  r.post('/system/pick-folder', hostMachineOnly, async (_req, res) => {
    if (process.platform !== 'win32') throw new HttpError(501, 'unsupported', 'Folder picking is only available on Windows. Type the path instead.');
    res.json({ path: await pickFolder(settings.outputBase()) });
  });

  r.post('/system/open-output', hostMachineOnly, async (_req, res) => {
    const dir = settings.outputBase();
    await fs.mkdir(dir, { recursive: true });
    openFolder(dir);
    res.status(204).end();
  });

  /** Remove temp files that no running export is using. */
  r.post('/system/cleanup-temp', async (_req, res) => {
    const active = new Set(exportsQueue.list().filter((j) => isActiveState(j.state)).map((j) => j.id));
    const before = await dirSize(paths.tempDir);
    for (const sub of [paths.tempDir, paths.uploadsDir]) {
      const entries = await fs.readdir(sub, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (!e.isFile()) continue;
        if ([...active].some((id) => e.name.startsWith(id))) continue;
        // Uploads still streaming in are recent; leave anything touched in the last 10 minutes.
        const p = path.join(sub, e.name);
        const st = await fs.stat(p).catch(() => null);
        if (st && Date.now() - st.mtimeMs > 10 * 60_000) await fs.rm(p, { force: true });
      }
    }
    res.json({ freed: Math.max(0, before - (await dirSize(paths.tempDir))) });
  });

  return r;
}
