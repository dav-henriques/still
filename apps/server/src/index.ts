import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createApp, createServices } from './app.ts';
import os from 'node:os';
import { HOST, LAN, PORT } from './config.ts';

const serveWeb = process.argv.includes('--serve-web');
const shouldOpen = process.argv.includes('--open');

const services = await createServices();
const app = createApp(services, { serveWeb });

const server = app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  still — by ness`);
  console.log(`  engine   http://${HOST}:${PORT}`);
  if (serveWeb) console.log(`  app      ${url}`);
  if (LAN) {
    // Private IPv4 addresses other computers at home can use.
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i!.address);
    for (const ip of ips) console.log(`  network  http://${ip}:${PORT}`);
    console.log('  LAN mode: anyone on this network can open still — there is no login.');
  }
  console.log(`  data     ${services.paths.dataDir}`);
  if (shouldOpen) openBrowser(url);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use — still may already be running. Open http://localhost:${PORT}\n`);
    process.exit(1);
  }
  throw err;
});

// Long renders and SSE: no request timeouts on a local server.
server.requestTimeout = 0;
server.headersTimeout = 60_000;

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  console.log('\n  shutting down…');
  services.events.closeAll();
  await services.exportsQueue.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function openBrowser(url: string) {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['LOCALAPPDATA'] ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    const chrome = candidates.find((c) => fs.existsSync(c));
    if (chrome) spawn(chrome, [`--app=${url}`, '--window-size=1600,960'], { detached: true, stdio: 'ignore' }).unref();
    else spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}
