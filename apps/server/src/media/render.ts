import { spawn } from 'node:child_process';
import { QUALITY_PRESETS, VIDEO, type Quality } from '@still/shared';
import { binaryPath } from './binaries.ts';
import { tailLog } from './exec.ts';

export interface RenderInput {
  artworkPng: string; // the prepared 1080×1080 square
  audioFile: string;
  audioCodec: string;
  duration: number; // source audio duration, seconds
  sampleRate: number | null;
  quality: Quality;
  segmentPath: string; // temp file for the encoded still segment
  output: string;
}

/** Length of the pre-encoded still segment (one closed GOP). */
export const SEGMENT_SECONDS = 10;
/** Share of the progress bar given to the segment encode; the rest tracks the mux/audio pass. */
const SEGMENT_WEIGHT = 0.1;

/**
 * Pass 1: encode the composition once — a short, closed-GOP H.264 segment of the static frame.
 * The 1920×1080 frame is built and colour-converted a single time (loop filter), padded in RGB
 * with pure black and converted with an explicit BT.709 matrix so the 420px side bars decode to
 * exactly #000000 and colours match what players assume for HD.
 */
export function buildSegmentArgs(input: RenderInput): string[] {
  const q = QUALITY_PRESETS[input.quality];
  const { width, height, fps, artworkX, artworkY } = VIDEO;
  const seconds = Math.min(SEGMENT_SECONDS, Math.max(1 / fps, input.duration));
  const gop = Math.round(seconds * fps);
  const filter =
    `[0:v]format=rgb24,pad=${width}:${height}:${artworkX}:${artworkY}:color=black,` +
    `scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,` +
    `loop=loop=-1:size=1:start=0,setpts=N/${fps}/TB,trim=duration=${seconds.toFixed(6)}[v]`;
  return [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
    '-i', input.artworkPng,
    '-filter_complex', filter, '-map', '[v]',
    '-c:v', 'libx264', '-preset', q.preset, '-tune', 'stillimage', '-crf', String(q.crf),
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0',
    '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-an', '-f', 'mp4', input.segmentPath,
  ];
}

/**
 * Pass 2: loop the segment by stream copy (no re-encode) under the complete original audio,
 * cut to the exact audio duration. AAC sources are passed through untouched.
 */
export function buildMuxArgs(input: RenderInput): string[] {
  const q = QUALITY_PRESETS[input.quality];
  const args = [
    '-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
    '-stream_loop', '-1', '-i', input.segmentPath,
    '-i', input.audioFile,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
  ];
  if (input.audioCodec === 'aac') {
    args.push('-c:a', 'copy');
  } else {
    // The native encoder's two-loop search is ~3× slower; at ≥256 kbps the difference is inaudible,
    // so it is reserved for Maximum.
    args.push('-c:a', 'aac', '-aac_coder', input.quality === 'maximum' ? 'twoloop' : 'fast', '-b:a', q.audioBitrate);
    // The AAC encoder tops out at 96 kHz; only resample when the source exceeds it.
    if (input.sampleRate && input.sampleRate > 96_000) args.push('-ar', '48000');
  }
  args.push('-t', input.duration.toFixed(6), '-map_metadata', '-1', '-movflags', '+faststart', '-f', 'mp4', input.output);
  return args;
}

/** Incremental parser for `-progress pipe:1` key=value output. */
export class ProgressParser {
  private buffer = '';
  outTime = 0;
  ended = false;

  /** Feed raw stdout; returns true when a progress block completed. */
  push(chunk: string): boolean {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    let block = false;
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (key === 'out_time_us' || key === 'out_time_ms') {
        // Both are microseconds in FFmpeg (out_time_ms is a historical misnomer). "N/A" is ignored.
        const us = Number(value);
        if (value !== '' && Number.isFinite(us) && us >= 0) this.outTime = us / 1e6;
      } else if (key === 'progress') {
        block = true;
        if (value === 'end') this.ended = true;
      }
    }
    return block;
  }

  fraction(duration: number): number {
    if (!(duration > 0)) return 0;
    return Math.min(1, Math.max(0, this.outTime / duration));
  }
}

export class RenderError extends Error {
  constructor(
    message: string,
    public details: string | null,
  ) {
    super(message);
  }
}

export class RenderCancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

function explain(stderr: string): string {
  if (/No space left|ENOSPC|There is not enough space/i.test(stderr)) return 'Not enough disk space to write the video.';
  if (/Permission denied|EACCES/i.test(stderr)) return 'The output folder is not writable.';
  if (/Invalid data found|could not find codec|Error while decoding/i.test(stderr)) return 'The audio file could not be decoded.';
  return 'FFmpeg could not render this video.';
}

function runFfmpeg(args: string[], duration: number, signal: AbortSignal, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new RenderCancelled());
    const child = spawn(binaryPath('ffmpeg'), args, { windowsHide: true, shell: false });
    const parser = new ProgressParser();
    let stderr = '';
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      if (parser.push(d)) onProgress(parser.fraction(duration));
    });
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-32 * 1024)));
    child.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(new RenderError('FFmpeg could not be started.', String(err)));
    });
    child.on('close', (code, sig) => {
      signal.removeEventListener('abort', onAbort);
      if (cancelled) return reject(new RenderCancelled());
      if (code === 0) return resolve();
      reject(new RenderError(explain(stderr), tailLog(stderr) || `FFmpeg exited with ${code ?? sig}`));
    });
  });
}

/** Two native FFmpeg passes; progress is real (FFmpeg's own out_time against known durations). */
export async function renderVideo(input: RenderInput, opts: { signal: AbortSignal; onProgress: (fraction: number) => void }): Promise<void> {
  const segSeconds = Math.min(SEGMENT_SECONDS, input.duration);
  await runFfmpeg(buildSegmentArgs(input), segSeconds, opts.signal, (f) => opts.onProgress(f * SEGMENT_WEIGHT));
  await runFfmpeg(buildMuxArgs(input), input.duration, opts.signal, (f) => opts.onProgress(SEGMENT_WEIGHT + f * (1 - SEGMENT_WEIGHT)));
}
