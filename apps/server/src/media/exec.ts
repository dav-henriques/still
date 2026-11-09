import { spawn } from 'node:child_process';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** spawn() with an argument array — never a shell — collecting output. */
export function run(bin: string, args: string[], opts: { timeoutMs?: number; maxBuffer?: number; env?: Record<string, string> } = {}): Promise<RunResult> {
  const { timeoutMs = 120_000, maxBuffer = 16 * 1024 * 1024 } = opts;
  return new Promise((resolve, reject) => {
    const env = opts.env ? { ...process.env, ...opts.env } : process.env;
    const child = spawn(bin, args, { windowsHide: true, shell: false, env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < maxBuffer) stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-64 * 1024);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Last meaningful lines of an FFmpeg stderr log, for user-facing details. */
export function tailLog(stderr: string, lines = 12): string {
  return stderr.trim().split(/\r?\n/).slice(-lines).join('\n');
}
