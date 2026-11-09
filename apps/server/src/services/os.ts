import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../media/exec.ts';

const detached = (cmd: string, args: string[]) => spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();

/** Show a file selected in Explorer / Finder (or open its folder on Linux). */
export function revealInFileManager(file: string) {
  if (process.platform === 'win32') {
    // Explorer only understands /select,"path" — pass it verbatim (Windows paths can't contain quotes).
    spawn('explorer.exe', [`/select,"${file}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  }
  else if (process.platform === 'darwin') detached('open', ['-R', file]);
  else detached('xdg-open', [path.dirname(file)]);
}

export function openFolder(dir: string) {
  if (process.platform === 'win32') detached('explorer.exe', [dir]);
  else detached(process.platform === 'darwin' ? 'open' : 'xdg-open', [dir]);
}

/**
 * Native folder picker. Browsers can't hand a writable path to a local server, so on Windows the
 * backend shows the standard folder dialog itself. Returns null if cancelled or unsupported.
 */
export async function pickFolder(initial: string): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$owner = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Choose where still saves exported videos'",
    '$d.ShowNewFolderButton = $true',
    '$d.SelectedPath = $env:STILL_INITIAL_DIR',
    "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; Write-Output $d.SelectedPath }",
  ].join('; ');
  // The initial path is passed via env so it is never interpolated into the script.
  const res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
    timeoutMs: 10 * 60_000,
    env: { STILL_INITIAL_DIR: initial },
  });
  const picked = res.stdout.trim();
  return picked && fs.existsSync(picked) ? picked : null;
}
