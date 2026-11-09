import { describe, expect, it } from 'vitest';
import { canTransition, JOB_STATES } from './jobs.ts';
import { computeCropRect, cropToBoxStyle, DEFAULT_CROP, normalizeCrop, panCrop, zoomCrop } from './crop.ts';
import { extensionOf, sanitizeFilename, stripExtension, uniqueStem } from './filename.ts';
import { formatBytes, formatDuration } from './format.ts';
import { ProjectSchema } from './schemas.ts';

describe('crop model', () => {
  it('defaults to the centered largest square (cover)', () => {
    expect(computeCropRect(3200, 1800, DEFAULT_CROP)).toEqual({ left: 700, top: 0, size: 1800 });
    expect(computeCropRect(2400, 3000, DEFAULT_CROP)).toEqual({ left: 0, top: 300, size: 2400 });
    expect(computeCropRect(1500, 1500, DEFAULT_CROP)).toEqual({ left: 0, top: 0, size: 1500 });
  });

  it('maps x/y across the free travel and zoom to a smaller window', () => {
    expect(computeCropRect(3200, 1800, { zoom: 1, x: 0, y: 0.5 })).toEqual({ left: 0, top: 0, size: 1800 });
    expect(computeCropRect(3200, 1800, { zoom: 1, x: 1, y: 0.5 })).toEqual({ left: 1400, top: 0, size: 1800 });
    expect(computeCropRect(2000, 2000, { zoom: 2, x: 0.5, y: 0.5 })).toEqual({ left: 500, top: 500, size: 1000 });
    expect(computeCropRect(2000, 2000, { zoom: 2, x: 1, y: 0 })).toEqual({ left: 1000, top: 0, size: 1000 });
  });

  it('never exposes pixels outside the image, for any input', () => {
    for (let i = 0; i < 5000; i++) {
      const w = 1 + Math.floor(Math.random() * 6000);
      const h = 1 + Math.floor(Math.random() * 6000);
      const crop = { zoom: Math.random() * 12 - 2, x: Math.random() * 3 - 1, y: Math.random() * 3 - 1 };
      const r = computeCropRect(w, h, crop);
      expect(r.size).toBeGreaterThanOrEqual(1);
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.size).toBeLessThanOrEqual(w);
      expect(r.top + r.size).toBeLessThanOrEqual(h);
      expect(Number.isInteger(r.left) && Number.isInteger(r.top) && Number.isInteger(r.size)).toBe(true);
    }
  });

  it('normalizes junk values', () => {
    expect(normalizeCrop({ zoom: NaN, x: 5, y: -3 })).toEqual({ zoom: 1, x: 1, y: 0 });
    expect(normalizeCrop(undefined)).toEqual(DEFAULT_CROP);
  });

  it('preview CSS placement shows exactly the crop rect', () => {
    const crop = { zoom: 1.7, x: 0.2, y: 0.9 };
    const rect = computeCropRect(4000, 3000, crop);
    const box = 540;
    const s = cropToBoxStyle(4000, 3000, crop, box);
    const scale = box / rect.size;
    expect(s.width).toBeCloseTo(4000 * scale);
    expect(-s.offsetX / scale).toBeCloseTo(rect.left);
    expect(-s.offsetY / scale).toBeCloseTo(rect.top);
    // The visible box edge maps to the far edge of the rect.
    expect((-s.offsetX + box) / scale).toBeCloseTo(rect.left + rect.size);
  });

  it('pans in source pixels and clamps at the edges', () => {
    const c = panCrop(3200, 1800, DEFAULT_CROP, 350, 0);
    expect(computeCropRect(3200, 1800, c).left).toBe(1050);
    expect(panCrop(3200, 1800, DEFAULT_CROP, 99_999, 0).x).toBe(1);
    expect(panCrop(3200, 1800, DEFAULT_CROP, 0, 500).y).toBe(0.5); // no vertical travel at zoom 1
  });

  it('zooms around an anchor point', () => {
    const before = { zoom: 1, x: 0.5, y: 0.5 };
    const after = zoomCrop(2000, 2000, before, 2, 0.25, 0.25);
    const r = computeCropRect(2000, 2000, after);
    // The source point under the anchor (500,500) stays at 25% of the square.
    expect(r.left + r.size * 0.25).toBeCloseTo(500, 0);
    expect(r.top + r.size * 0.25).toBeCloseTo(500, 0);
  });
});

describe('filenames', () => {
  it('sanitizes characters Windows rejects', () => {
    expect(sanitizeFilename('My: Beat? <prod> "x" | y*')).toBe('My Beat prod x y');
    expect(sanitizeFilename('a/b\\c')).toBe('a b c');
    expect(sanitizeFilename('trailing dots...')).toBe('trailing dots');
    expect(sanitizeFilename('   ')).toBe('untitled');
    expect(sanitizeFilename('CON')).toBe('CON_');
    expect(sanitizeFilename('lpt1')).toBe('lpt1_');
    expect(sanitizeFilename('x'.repeat(400)).length).toBeLessThanOrEqual(150);
    expect(sanitizeFilename('Ação & Café — 140bpm')).toBe('Ação & Café — 140bpm');
  });

  it('finds a unique stem', () => {
    const taken = new Set(['beat', 'beat (2)']);
    expect(uniqueStem('beat', (s) => taken.has(s))).toBe('beat (3)');
    expect(uniqueStem('fresh', (s) => taken.has(s))).toBe('fresh');
  });

  it('splits extensions', () => {
    expect(stripExtension('My.Beat.final.WAV')).toBe('My.Beat.final');
    expect(extensionOf('My.Beat.final.WAV')).toBe('wav');
    expect(extensionOf('.hidden')).toBe('');
  });
});

describe('export job states', () => {
  it('allows the documented lifecycle only', () => {
    expect(canTransition('queued', 'preparing')).toBe(true);
    expect(canTransition('preparing', 'rendering')).toBe(true);
    expect(canTransition('rendering', 'completed')).toBe(true);
    expect(canTransition('rendering', 'cancelled')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('queued', 'completed')).toBe(false);
    expect(canTransition('completed', 'queued')).toBe(false);
    for (const s of JOB_STATES) expect(canTransition('completed', s)).toBe(false);
  });
});

describe('formatting', () => {
  it('formats durations and sizes', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(187.9)).toBe('3:07');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 ** 2)).toBe('25 MB');
  });
});

describe('project metadata validation', () => {
  const valid = {
    schemaVersion: 1,
    id: 'abcdef0123456789',
    name: 'x',
    createdAt: '',
    updatedAt: '',
    beats: [],
    artworks: {},
    exportSettings: { quality: 'high' },
  };
  it('accepts a valid project and rejects damaged ones', () => {
    expect(ProjectSchema.safeParse(valid).success).toBe(true);
    expect(ProjectSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...valid, id: '../etc' }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...valid, exportSettings: { quality: 'ultra' } }).success).toBe(false);
  });
});
