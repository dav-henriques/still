import { ZOOM_MAX, ZOOM_MIN } from './constants.ts';

/**
 * Resolution-independent crop.
 * zoom: 1 = the largest square that fits the image ("cover"), up to ZOOM_MAX.
 * x / y: where the crop window sits inside its free travel; 0 = left/top edge, 0.5 = centered, 1 = right/bottom.
 * Every in-range value is valid by construction — the window can never leave the image.
 */
export interface Crop {
  zoom: number;
  x: number;
  y: number;
}

export interface CropRect {
  left: number;
  top: number;
  size: number;
}

export const DEFAULT_CROP: Crop = { zoom: 1, x: 0.5, y: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number | undefined, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function normalizeCrop(crop: Partial<Crop> | undefined): Crop {
  return {
    zoom: clamp(finite(crop?.zoom, 1), ZOOM_MIN, ZOOM_MAX),
    x: clamp(finite(crop?.x, 0.5), 0, 1),
    y: clamp(finite(crop?.y, 0.5), 0, 1),
  };
}

/**
 * The single source of truth for which source pixels end up in the 1080×1080 square.
 * Used by the preview (CSS), thumbnails, and the renderer (sharp extract). Integer pixels.
 */
export function computeCropRect(width: number, height: number, crop: Crop): CropRect {
  const c = normalizeCrop(crop);
  const base = Math.min(width, height);
  const size = clamp(Math.round(base / c.zoom), 1, base);
  const left = Math.round((width - size) * c.x);
  const top = Math.round((height - size) * c.y);
  return { left: clamp(left, 0, width - size), top: clamp(top, 0, height - size), size };
}

/** Pan by a delta in source pixels (positive = the crop window moves right/down). */
export function panCrop(width: number, height: number, crop: Crop, dxSource: number, dySource: number): Crop {
  const c = normalizeCrop(crop);
  const size = Math.min(width, height) / c.zoom;
  const slackX = width - size;
  const slackY = height - size;
  return normalizeCrop({
    zoom: c.zoom,
    x: slackX > 0.5 ? (slackX * c.x + dxSource) / slackX : 0.5,
    y: slackY > 0.5 ? (slackY * c.y + dySource) / slackY : 0.5,
  });
}

/** Change zoom while keeping the source point under (fx, fy ∈ 0..1 of the square) fixed. */
export function zoomCrop(width: number, height: number, crop: Crop, nextZoom: number, fx = 0.5, fy = 0.5): Crop {
  const c = normalizeCrop(crop);
  const z = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
  const base = Math.min(width, height);
  const size = base / c.zoom;
  const anchorX = (width - size) * c.x + size * fx;
  const anchorY = (height - size) * c.y + size * fy;
  const nextSize = base / z;
  const slackX = width - nextSize;
  const slackY = height - nextSize;
  return normalizeCrop({
    zoom: z,
    x: slackX > 0.5 ? (anchorX - nextSize * fx) / slackX : 0.5,
    y: slackY > 0.5 ? (anchorY - nextSize * fy) / slackY : 0.5,
  });
}

/**
 * CSS placement of the full source image inside a square box of `box` px so exactly
 * computeCropRect() is visible. Derived from the same rect, so preview and export cannot drift.
 */
export function cropToBoxStyle(width: number, height: number, crop: Crop, box: number) {
  const rect = computeCropRect(width, height, crop);
  const scale = box / rect.size;
  return {
    width: width * scale,
    height: height * scale,
    offsetX: -rect.left * scale,
    offsetY: -rect.top * scale,
  };
}
