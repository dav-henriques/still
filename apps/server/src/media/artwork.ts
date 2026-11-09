import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { computeCropRect, VIDEO, type Crop } from '@still/shared';
import { MediaError } from './probe.ts';

sharp.cache(false); // don't hold multi-hundred-MB decoded artworks in memory between calls

const FORMATS = new Set(['png', 'jpeg', 'webp']);

export interface ImportedArtwork {
  file: string;
  format: string;
  width: number;
  height: number;
  displayFile: string;
  thumbFile: string;
}

/**
 * Validate the real image format (not just the extension), bake EXIF orientation into a
 * lossless render source when needed, and create display / thumbnail derivatives.
 * `dir` is the project's artwork folder; `id` names the files.
 */
export async function importArtwork(src: string, dir: string, id: string, ext: string): Promise<ImportedArtwork> {
  let meta: Metadata;
  try {
    meta = await sharp(src).metadata();
  } catch (err) {
    throw new MediaError('This image could not be read. It may be corrupt or not a PNG, JPEG or WebP file.', String(err));
  }
  if (!meta.format || !FORMATS.has(meta.format)) {
    throw new MediaError('Unsupported image format. Use PNG, JPEG or WebP.', `Detected: ${meta.format ?? 'unknown'}`);
  }
  if (!meta.width || !meta.height) throw new MediaError('The image has no readable dimensions.');

  await fs.mkdir(dir, { recursive: true });
  const original = path.join(dir, `${id}.original.${ext}`);
  await fs.rename(src, original);

  let file = path.basename(original);
  let { width, height } = meta;
  if (meta.orientation && meta.orientation > 1) {
    // Browsers honour EXIF orientation; FFmpeg/sharp-extract don't. Bake it in so preview == export.
    const oriented = path.join(dir, `${id}.oriented.png`);
    const info = await sharp(original).rotate().png({ compressionLevel: 6 }).toFile(oriented);
    file = path.basename(oriented);
    width = info.width;
    height = info.height;
  }
  const source = path.join(dir, file);
  const displayFile = `${id}.display.webp`;
  const thumbFile = `${id}.thumb.webp`;
  await sharp(source)
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 92 })
    .toFile(path.join(dir, displayFile));
  await sharp(source).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(dir, thumbFile));

  return { file, format: meta.format, width, height, displayFile, thumbFile };
}

/** Produce the exact 1080×1080 square the video uses, from the shared crop model. */
export async function prepareSquare(source: string, width: number, height: number, crop: Crop, dest: string): Promise<void> {
  const rect = computeCropRect(width, height, crop);
  await sharp(source)
    .extract({ left: rect.left, top: rect.top, width: rect.size, height: rect.size })
    .resize(VIDEO.artworkSize, VIDEO.artworkSize, { kernel: 'lanczos3', fit: 'fill' })
    .flatten({ background: '#000000' })
    .png({ compressionLevel: 3 })
    .toFile(dest);
}
