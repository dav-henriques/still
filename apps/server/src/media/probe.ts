import { binaryPath } from './binaries.ts';
import { run } from './exec.ts';

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
  bits_per_raw_sample?: string;
  bits_per_sample?: number;
  sample_fmt?: string;
  width?: number;
  height?: number;
  duration?: string;
  disposition?: { attached_pic?: number };
}
interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string; size?: string };
}

export class MediaError extends Error {
  constructor(
    message: string,
    public details?: string,
  ) {
    super(message);
  }
}

async function ffprobe(file: string): Promise<FfprobeResult> {
  const res = await run(binaryPath('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {
    timeoutMs: 60_000,
  });
  if (res.code !== 0) throw new MediaError('The file could not be read. It may be corrupt or in an unsupported format.', res.stderr.trim());
  try {
    return JSON.parse(res.stdout) as FfprobeResult;
  } catch {
    throw new MediaError('Unexpected response while inspecting the file.', res.stdout.slice(0, 500));
  }
}

const num = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Containers we accept for audio import (ffprobe format_name tokens).
const AUDIO_FORMATS = new Set(['wav', 'mp3', 'flac', 'mov', 'mp4', 'm4a', 'aac', 'ogg', 'aiff', 'matroska', 'webm']);
// Codecs Chrome can play natively from those containers.
const BROWSER_CODECS = new Set(['mp3', 'flac', 'aac', 'vorbis', 'opus', 'pcm_u8', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le']);

export interface AudioProbe {
  formatName: string;
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  bitRate: number | null;
  bitDepth: number | null;
  duration: number;
  browserPlayable: boolean;
}

export async function probeAudio(file: string): Promise<AudioProbe> {
  const info = await ffprobe(file);
  const formatName = info.format?.format_name ?? '';
  if (!formatName.split(',').some((f) => AUDIO_FORMATS.has(f))) {
    throw new MediaError('This file is not a supported audio format.', `Detected container: ${formatName || 'unknown'}`);
  }
  const stream = info.streams?.find((s) => s.codec_type === 'audio');
  if (!stream) throw new MediaError('No audio stream found in this file.');
  const duration = num(info.format?.duration) ?? num(stream.duration);
  if (!duration) throw new MediaError('Could not determine the audio duration. The file may be corrupt.');
  const codec = stream.codec_name ?? 'unknown';
  const bitDepth =
    num(stream.bits_per_raw_sample) ?? num(stream.bits_per_sample) ?? (stream.sample_fmt?.startsWith('flt') ? 32 : null);
  return {
    formatName,
    codec,
    sampleRate: num(stream.sample_rate),
    channels: stream.channels ?? null,
    bitRate: num(stream.bit_rate) ?? num(info.format?.bit_rate),
    bitDepth: codec.startsWith('pcm_') || codec === 'flac' || codec === 'alac' ? bitDepth : null,
    duration,
    browserPlayable: BROWSER_CODECS.has(codec) && !formatName.includes('aiff'),
  };
}

export interface OutputProbe {
  formatName: string;
  duration: number;
  video: { codec: string; width: number; height: number } | null;
  audio: { codec: string } | null;
}

export async function probeOutput(file: string): Promise<OutputProbe> {
  const info = await ffprobe(file);
  const v = info.streams?.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = info.streams?.find((s) => s.codec_type === 'audio');
  return {
    formatName: info.format?.format_name ?? '',
    duration: num(info.format?.duration) ?? 0,
    video: v ? { codec: v.codec_name ?? '', width: v.width ?? 0, height: v.height ?? 0 } : null,
    audio: a ? { codec: a.codec_name ?? '' } : null,
  };
}
