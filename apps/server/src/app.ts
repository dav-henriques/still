import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { formatBytes, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, type ApiErrorBody } from '@still/shared';
import { exportsRouter } from './api/exports.ts';
import { projectsRouter } from './api/projects.ts';
import { systemRouter } from './api/system.ts';
import { RENDER_CONCURRENCY, WEB_DIST, resolvePaths, type Paths } from './config.ts';
import { ExportQueue } from './exports/queue.ts';
import { detectBinaries, MissingBinaryError } from './media/binaries.ts';
import { MediaError } from './media/probe.ts';
import { localOnly } from './middleware/security.ts';
import { ProjectStore } from './projects/store.ts';
import { EventHub } from './services/events.ts';
import { SettingsStore } from './services/settings.ts';
import { HttpError } from './storage/fs.ts';

export interface Services {
  paths: Paths;
  events: EventHub;
  settings: SettingsStore;
  projects: ProjectStore;
  exportsQueue: ExportQueue;
}

export async function createServices(dataDir?: string): Promise<Services> {
  const paths = resolvePaths(dataDir);
  // Nothing is rendering or uploading before startup, so anything left in temp is from a crash.
  await fsp.rm(paths.tempDir, { recursive: true, force: true, maxRetries: 3 });
  for (const d of [paths.projectsDir, paths.exportsDir, paths.tempDir, paths.uploadsDir]) await fsp.mkdir(d, { recursive: true });
  const events = new EventHub();
  const settings = new SettingsStore(paths);
  await settings.load();
  await detectBinaries(settings.get(), true);
  const projects = new ProjectStore(paths, events);
  const exportsQueue = new ExportQueue(paths, projects, settings, events, RENDER_CONCURRENCY);
  await exportsQueue.load();
  return { paths, events, settings, projects, exportsQueue };
}

export function createApp(services: Services, opts: { serveWeb?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.use('/api', localOnly);
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/events', services.events.handler);
  app.use('/api', systemRouter(services));
  app.use('/api/projects', projectsRouter(services));
  app.use('/api/exports', exportsRouter(services));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } } satisfies ApiErrorBody);
  });

  if (opts.serveWeb && fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(localOnly);
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1y', immutable: true }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Remove partial uploads from a failed multipart request.
  const files = [...((req.files as Express.Multer.File[] | undefined) ?? []), ...(req.file ? [req.file] : [])];
  for (const f of files) void fsp.rm(f.path, { force: true });

  let status = 500;
  let body: ApiErrorBody = { error: { code: 'internal', message: 'Something went wrong.' } };
  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } };
  } else if (err instanceof MediaError) {
    status = 422;
    body = { error: { code: 'media_error', message: err.message, ...(err.details ? { details: err.details } : {}) } };
  } else if (err instanceof MissingBinaryError) {
    status = 503;
    body = { error: { code: 'ffmpeg_missing', message: err.message } };
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const limit = req.path.endsWith('/artwork') ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    body = {
      error: { code: err.code.toLowerCase(), message: err.code === 'LIMIT_FILE_SIZE' ? `File is larger than ${formatBytes(limit)}.` : err.message },
    };
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'invalid_json', message: 'Invalid JSON body.' } };
  } else if ((err as NodeJS.ErrnoException).code === 'ENOSPC') {
    status = 507;
    body = { error: { code: 'disk_full', message: 'Not enough disk space.' } };
  } else {
    console.error('[still]', err);
    body.error.details = String(err);
  }
  if (!res.headersSent) res.status(status).json(body);
}
