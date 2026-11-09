import type { z } from 'zod';
import { HttpError } from '../storage/fs.ts';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, 'invalid_request', `${where}${issue?.message ?? 'Invalid request'}`);
  }
  return result.data;
}
