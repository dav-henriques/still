import fs from 'node:fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import type { Services } from '../app.ts';
import { HttpError, exists } from '../storage/fs.ts';
import { hostMachineOnly } from '../middleware/security.ts';
import { revealInFileManager } from '../services/os.ts';
import { parse } from './validate.ts';

export function exportsRouter({ exportsQueue }: Services) {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(exportsQueue.list());
  });

  r.post('/cancel-queued', async (_req, res) => {
    res.json({ cancelled: await exportsQueue.cancelQueued() });
  });

  r.post('/clear', async (req, res) => {
    const { state } = parse(z.object({ state: z.enum(['completed', 'failed', 'all']) }), req.body);
    res.json({ removed: await exportsQueue.clearFinished(state) });
  });

  r.get('/:exportId', (req, res) => {
    res.json(exportsQueue.get(req.params.exportId));
  });

  r.delete('/:exportId', async (req, res) => {
    await exportsQueue.remove(req.params.exportId);
    res.status(204).end();
  });

  r.post('/:exportId/cancel', async (req, res) => {
    res.json(await exportsQueue.cancel(req.params.exportId));
  });

  r.post('/:exportId/retry', async (req, res) => {
    res.json(await exportsQueue.retry(req.params.exportId));
  });

  async function completedFile(id: string) {
    const job = exportsQueue.get(id);
    if (job.state !== 'completed' || !job.output) throw new HttpError(409, 'not_completed', 'This export has not completed.');
    if (!(await exists(job.output.path))) throw new HttpError(410, 'file_missing', 'The video file was moved or deleted.');
    return job.output;
  }

  // Paths come from the job record written by the server, never from the request.
  r.get('/:exportId/file', async (req, res) => {
    const out = await completedFile(req.params.exportId);
    const disposition = req.query.inline ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
    res.sendFile(out.path, { dotfiles: 'allow' });
  });

  r.post('/:exportId/reveal', hostMachineOnly, async (req, res) => {
    const out = await completedFile(req.params.exportId as string);
    await fs.access(out.path);
    revealInFileManager(out.path);
    res.status(204).end();
  });

  return r;
}
