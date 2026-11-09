import { spawn } from 'node:child_process';
import { binaryPath } from './binaries.ts';
import { run, tailLog } from './exec.ts';
import { MediaError } from './probe.ts';

export const PEAK_BUCKETS = 1800;
const PEAK_RATE = 22050;

/**
 * Decode once through FFmpeg (streamed, never fully in RAM) and reduce to max-abs peaks per bucket.
 */
export function computePeaks(file: string, duration: number, buckets = PEAK_BUCKETS): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const totalSamples = Math.max(1, Math.ceil(duration * PEAK_RATE));
    const perBucket = totalSamples / buckets;
    const peaks = new Array<number>(buckets).fill(0);
    let index = 0;
    let carry: Buffer = Buffer.alloc(0);
    let stderr = '';

    const child = spawn(
      binaryPath('ffmpeg'),
      ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(PEAK_RATE), '-f', 'f32le', 'pipe:1'],
      { windowsHide: true },
    );
    child.stdout.on('data', (chunk: Buffer) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      for (let off = 0; off < usable; off += 4) {
        const b = Math.min(buckets - 1, Math.floor(index / perBucket));
        const v = Math.abs(buf.readFloatLE(off));
        if (v > peaks[b]!) peaks[b] = v;
        index++;
      }
      carry = buf.subarray(usable);
    });
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-8000)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new MediaError('Could not decode audio for the waveform.', tailLog(stderr)));
      resolve(peaks.map((p) => Math.round(Math.min(1, p) * 1000) / 1000));
    });
  });
}

/** Lossless FLAC proxy for sources Chrome can't decode (AIFF, ALAC, big-endian PCM…). */
export async function createPlaybackProxy(src: string, dest: string): Promise<void> {
  const res = await run(binaryPath('ffmpeg'), ['-v', 'error', '-y', '-i', src, '-vn', '-map', '0:a:0', '-c:a', 'flac', dest], {
    timeoutMs: 10 * 60_000,
  });
  if (res.code !== 0) throw new MediaError('Could not prepare this file for playback.', tailLog(res.stderr));
}
