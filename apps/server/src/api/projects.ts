import { Router } from 'express';
import multer from 'multer';
import {
  CreateExportsBody,
  CreateProjectBody,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  RemoveBeatsBody,
  UpdateBeatBody,
  UpdateProjectBody,
  IdSchema,
  normalizeCrop,
} from '@still/shared';
import { z } from 'zod';
import type { Services } from '../app.ts';
import { findBeat, type UploadedFile } from '../projects/store.ts';
import { HttpError, newId } from '../storage/fs.ts';
import { parse } from './validate.ts';

/** Browsers send UTF-8 filenames; busboy decodes them as latin1. Undo that when it round-trips. */
function fixName(name: string): string {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

export function projectsRouter({ paths, projects, exportsQueue, settings }: Services) {
  const r = Router();
  const storage = multer.diskStorage({
    destination: paths.uploadsDir,
    filename: (_req, _file, cb) => cb(null, `${newId()}.upload`),
  });
  const audioUpload = multer({ storage, limits: { fileSize: MAX_AUDIO_BYTES, files: 200 } });
  const imageUpload = multer({ storage, limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
  const asUploaded = (f: Express.Multer.File): UploadedFile => ({ path: f.path, originalname: fixName(f.originalname), size: f.size });

  r.get('/', async (_req, res) => {
    res.json(await projects.list());
  });

  r.post('/', async (req, res) => {
    const body = parse(CreateProjectBody, req.body);
    res.status(201).json(await projects.create(body.name, body.quality ?? settings.get().defaultQuality));
  });

  r.get('/:projectId', async (req, res) => {
    res.json(await projects.get(req.params.projectId));
  });

  r.patch('/:projectId', async (req, res) => {
    const body = parse(UpdateProjectBody, req.body);
    res.json(
      await projects.update(req.params.projectId, (p) => {
        if (body.name) p.name = body.name;
        if (body.exportSettings) p.exportSettings = body.exportSettings;
      }),
    );
  });

  r.delete('/:projectId', async (req, res) => {
    await projects.get(req.params.projectId);
    await exportsQueue.cancelProject(req.params.projectId);
    await projects.remove(req.params.projectId);
    res.status(204).end();
  });

  r.post('/:projectId/duplicate', async (req, res) => {
    res.status(201).json(await projects.duplicate(req.params.projectId));
  });

  // ── Audio / beats ──────────────────────────────────────────────

  r.post('/:projectId/audio', audioUpload.array('files'), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'no_files', 'No audio files were received.');
    const result = await projects.importAudio(req.params.projectId as string, files.map(asUploaded));
    res.status(result.imported.length ? 201 : 422).json(result);
  });

  r.get('/:projectId/audio', async (req, res) => {
    res.json((await projects.get(req.params.projectId)).beats);
  });

  r.patch('/:projectId/beats/:beatId', async (req, res) => {
    const body = parse(UpdateBeatBody, req.body);
    const project = await projects.update(req.params.projectId, (p) => {
      const beat = findBeat(p, req.params.beatId);
      if (body.name) beat.name = body.name;
      if (body.crop) beat.crop = normalizeCrop(body.crop);
      if (body.artworkId !== undefined) {
        if (body.artworkId && !p.artworks[body.artworkId]) throw new HttpError(404, 'artwork_not_found', 'Artwork not found');
        if (body.artworkId !== beat.artworkId && !body.crop) beat.crop = normalizeCrop(undefined);
        beat.artworkId = body.artworkId;
      }
      beat.updatedAt = new Date().toISOString();
    });
    res.json(project);
  });

  r.post('/:projectId/beats/remove', async (req, res) => {
    const body = parse(RemoveBeatsBody, req.body);
    res.json(await projects.removeBeats(req.params.projectId, body.beatIds));
  });

  // ── Artwork ────────────────────────────────────────────────────

  r.post('/:projectId/artwork', imageUpload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'no_file', 'No image was received.');
    const beatIds = parse(z.array(IdSchema).min(1, 'Choose at least one beat'), safeJson(req.body?.beatIds));
    res.status(201).json(await projects.importArtwork(req.params.projectId as string, asUploaded(req.file), beatIds));
  });

  // ── Media ──────────────────────────────────────────────────────

  r.get('/:projectId/media/audio/:beatId', async (req, res) => {
    const beat = findBeat(await projects.get(req.params.projectId), req.params.beatId);
    const file = beat.audio.playbackFile
      ? projects.cachePath(req.params.projectId, beat.audio.playbackFile)
      : projects.audioPath(req.params.projectId, beat.audio.file);
    res.sendFile(file, { dotfiles: 'allow', maxAge: 0 });
  });

  r.get('/:projectId/media/peaks/:beatId', async (req, res) => {
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.json(await projects.peaks(req.params.projectId, req.params.beatId));
  });

  r.get('/:projectId/media/artwork/:artworkId/:variant', async (req, res) => {
    const project = await projects.get(req.params.projectId);
    const art = project.artworks[req.params.artworkId];
    if (!art) throw new HttpError(404, 'artwork_not_found', 'Artwork not found');
    const variant = req.params.variant;
    const file = variant === 'thumb' ? art.thumbFile : variant === 'display' ? art.displayFile : variant === 'original' ? art.file : null;
    if (!file) throw new HttpError(404, 'not_found', 'Unknown artwork variant');
    res.sendFile(projects.artworkPath(project.id, file), { dotfiles: 'allow', maxAge: '365d', immutable: true });
  });

  // ── Exports for a project ──────────────────────────────────────

  r.get('/:projectId/exports', (req, res) => {
    res.json(exportsQueue.list(req.params.projectId));
  });

  r.post('/:projectId/exports', async (req, res) => {
    const body = parse(CreateExportsBody, req.body);
    res.status(201).json(await exportsQueue.enqueue(req.params.projectId, body.beatIds, body.quality));
  });

  return r;
}

function safeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
