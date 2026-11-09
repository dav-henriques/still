export const APP_NAME = 'still';
export const APP_SIGNATURE = 'by ness';
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

/** The exported composition. Non-negotiable for v1. */
export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  artworkSize: 1080,
  artworkX: 420,
  artworkY: 0,
  background: '#000000',
} as const;

export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'm4a', 'aac', 'ogg', 'aif', 'aiff'] as const;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

export const MAX_AUDIO_BYTES = 2 * 1024 ** 3; // 2 GB per file
export const MAX_IMAGE_BYTES = 100 * 1024 ** 2; // 100 MB per file

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

export const QUALITY_PRESETS = {
  standard: { label: 'Standard', crf: 20, preset: 'medium', audioBitrate: '256k', hint: 'Smaller files, fine for most uploads' },
  high: { label: 'High', crf: 16, preset: 'slow', audioBitrate: '320k', hint: 'Recommended — near-lossless artwork' },
  maximum: { label: 'Maximum', crf: 12, preset: 'slower', audioBitrate: '320k', hint: 'Largest files, every detail kept' },
} as const;
