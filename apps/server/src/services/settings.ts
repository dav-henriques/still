import fs from 'node:fs/promises';
import path from 'node:path';
import { SettingsSchema, type Settings } from '@still/shared';
import type { Paths } from '../config.ts';
import { HttpError, readJson, writeJsonAtomic } from '../storage/fs.ts';

const DEFAULTS: Settings = {
  defaultQuality: 'high',
  outputDir: null,
  projectView: 'list',
  ffmpegPath: null,
  ffprobePath: null,
};

export class SettingsStore {
  private current: Settings = DEFAULTS;
  constructor(private paths: Paths) {}

  async load(): Promise<Settings> {
    const raw = await readJson<unknown>(this.paths.settingsFile).catch(() => null);
    const parsed = SettingsSchema.partial().safeParse(raw ?? {});
    this.current = { ...DEFAULTS, ...(parsed.success ? parsed.data : {}) };
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  /** Where exports go: the user's folder, or the managed one. */
  outputBase(): string {
    return this.current.outputDir ?? this.paths.exportsDir;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...this.current, ...patch };
    if (patch.outputDir) next.outputDir = await validateOutputDir(patch.outputDir);
    for (const key of ['ffmpegPath', 'ffprobePath'] as const) {
      if (patch[key] !== undefined) next[key] = patch[key]?.trim() ? path.resolve(patch[key]!.trim()) : null;
    }
    this.current = SettingsSchema.parse(next);
    await writeJsonAtomic(this.paths.settingsFile, this.current);
    return this.current;
  }
}

async function validateOutputDir(input: string): Promise<string> {
  const dir = input.trim();
  if (!path.isAbsolute(dir)) throw new HttpError(400, 'invalid_output_dir', 'Use a full folder path, e.g. D:\\Videos\\Beats');
  const resolved = path.resolve(dir);
  try {
    await fs.mkdir(resolved, { recursive: true });
    const probe = path.join(resolved, `.still-write-test-${process.pid}`);
    await fs.writeFile(probe, '');
    await fs.rm(probe, { force: true });
  } catch (err) {
    throw new HttpError(400, 'output_dir_not_writable', 'still cannot write to that folder.', String(err));
  }
  return resolved;
}
