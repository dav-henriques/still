import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { BinaryStatus } from '@still/shared';

const require = createRequire(import.meta.url);

type Source = NonNullable<BinaryStatus['source']>;

function bundledPath(name: 'ffmpeg' | 'ffprobe'): string | null {
  try {
    if (name === 'ffmpeg') return (require('ffmpeg-static') as string | null) ?? null;
    return (require('ffprobe-static') as { path: string }).path ?? null;
  } catch {
    return null;
  }
}

/** Run `<bin> -version` and return the first line, or null if it can't execute. */
function probeVersion(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const child = spawn(bin, ['-hide_banner', '-version'], { windowsHide: true });
      const timer = setTimeout(() => {
        child.kill();
        done(null);
      }, 5000);
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.on('error', () => done(null));
      child.on('close', (code) => {
        clearTimeout(timer);
        const m = /version\s+(\S+)/.exec(out);
        done(code === 0 && m ? m[1]! : null);
      });
    } catch {
      done(null);
    }
  });
}

async function resolveBinary(name: 'ffmpeg' | 'ffprobe', configured: string | null): Promise<BinaryStatus> {
  const envPath = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'] || null;
  const candidates: [Source, string | null][] = [
    ['settings', configured],
    ['env', envPath],
    ['path', name],
    ['bundled', bundledPath(name)],
  ];
  for (const [source, p] of candidates) {
    if (!p) continue;
    const version = await probeVersion(p);
    if (version) return { available: true, path: p, version, source };
  }
  return { available: false, path: null, version: null, source: null };
}

let cache: { ffmpeg: BinaryStatus; ffprobe: BinaryStatus } | null = null;

export async function detectBinaries(paths: { ffmpegPath: string | null; ffprobePath: string | null }, force = false) {
  if (cache && !force) return cache;
  const [ffmpeg, ffprobe] = await Promise.all([
    resolveBinary('ffmpeg', paths.ffmpegPath),
    resolveBinary('ffprobe', paths.ffprobePath),
  ]);
  cache = { ffmpeg, ffprobe };
  return cache;
}

export class MissingBinaryError extends Error {
  constructor(name: string) {
    super(`${name} is not available. Open Settings → Processing for setup instructions.`);
  }
}

export function binaryPath(which: 'ffmpeg' | 'ffprobe'): string {
  const status = cache?.[which];
  if (!status?.available || !status.path) throw new MissingBinaryError(which === 'ffmpeg' ? 'FFmpeg' : 'FFprobe');
  return status.path;
}
