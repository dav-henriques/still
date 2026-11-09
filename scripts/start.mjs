// Production start: build the interface if it's missing or out of date, then run the engine,
// which serves the app on http://localhost:4317 and opens it in Chrome.
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist/index.html');

function newestMtime(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return newest;
}

const sources = [path.join(root, 'apps/web/src'), path.join(root, 'packages/shared/src')];
const stale = !fs.existsSync(dist) || Math.max(...sources.map(newestMtime)) > fs.statSync(dist).mtimeMs;
if (stale) {
  console.log('  building interface…');
  const r = spawnSync('npm', ['run', 'build', '-w', '@still/web'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const args = ['--import', 'tsx', path.join(root, 'apps/server/src/index.ts'), '--serve-web'];
if (!process.argv.includes('--no-open')) args.push('--open');
const engine = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
engine.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => engine.kill(sig));
