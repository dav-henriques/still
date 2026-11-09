// Runs the engine (tsx watch) and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  ['engine', ['run', 'dev', '-w', '@still/server']],
  ['web', ['run', 'dev', '-w', '@still/web']],
].map(([name, args]) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = name === 'engine' ? '\x1b[38;5;209mengine\x1b[0m' : '\x1b[90mweb   \x1b[0m';
  const out = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${tag} │ ${l}`));
  child.stdout.on('data', out);
  child.stderr.on('data', out);
  child.on('exit', (code) => {
    console.log(`${tag} │ exited (${code})`);
    stop();
  });
  return child;
});

function stop() {
  for (const p of procs) if (!p.killed) p.kill();
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
