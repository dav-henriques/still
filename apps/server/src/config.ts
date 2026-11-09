import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../../..');

export interface Paths {
  dataDir: string;
  projectsDir: string;
  exportsDir: string;
  tempDir: string;
  uploadsDir: string;
  settingsFile: string;
  jobsFile: string;
}

export function resolvePaths(dataDir = process.env.STILL_DATA_DIR || path.join(REPO_ROOT, 'data')): Paths {
  const root = path.resolve(dataDir);
  return {
    dataDir: root,
    projectsDir: path.join(root, 'projects'),
    exportsDir: path.join(root, 'exports'),
    tempDir: path.join(root, 'temp'),
    uploadsDir: path.join(root, 'temp', 'uploads'),
    settingsFile: path.join(root, 'settings.json'),
    jobsFile: path.join(root, 'exports.json'),
  };
}

export const PORT = Number(process.env.STILL_PORT || 4317);
/** STILL_LAN=1 opens still to other computers on the home network (private IPs only). */
export const LAN = process.env.STILL_LAN === '1';
export const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
export const RENDER_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.STILL_RENDER_CONCURRENCY || 1)));
export const WEB_DIST = path.join(REPO_ROOT, 'apps', 'web', 'dist');
