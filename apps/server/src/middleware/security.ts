import type { NextFunction, Request, Response } from 'express';
import { LAN } from '../config.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0] ?? null;
}

/** Home-network IPv4 ranges (RFC 1918). */
export function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m || m.slice(1).some((n) => Number(n) > 255)) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

const isLoopback = (host: string) => LOCAL_HOSTS.has(host) || host.startsWith('127.');

/** Loopback always; private IPs too in LAN mode. Hostnames other than localhost are refused (DNS rebinding). */
export function isAllowedHost(host: string, lan = LAN): boolean {
  return isLoopback(host) || (lan && isPrivateIPv4(host));
}

export function isAllowedOrigin(origin: string, lan = LAN): boolean {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && isAllowedHost(u.hostname.toLowerCase(), lan);
  } catch {
    return false;
  }
}

const peerOf = (req: Request) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

/**
 * API protection:
 *  - The connecting machine must be this computer (or, in LAN mode, on the home network).
 *  - Host must be loopback / a private IP (blocks DNS-rebinding attacks).
 *  - Cross-origin requests from other websites are refused.
 */
export function localOnly(req: Request, res: Response, next: NextFunction) {
  const host = hostnameOf(req.headers.host);
  if (!isAllowedHost(peerOf(req)) || !host || !isAllowedHost(host)) {
    res.status(403).json({ error: { code: 'forbidden_host', message: 'still only accepts local connections.' } });
    return;
  }
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: { code: 'forbidden_origin', message: 'Cross-origin requests are not allowed.' } });
    return;
  }
  if (!origin && site === 'cross-site') {
    res.status(403).json({ error: { code: 'forbidden_origin', message: 'Cross-site requests are not allowed.' } });
    return;
  }
  next();
}

/** For actions that open windows on the computer running still (Explorer, folder picker). */
export function hostMachineOnly(req: Request, res: Response, next: NextFunction) {
  if (isLoopback(peerOf(req))) return next();
  res.status(403).json({
    error: { code: 'host_machine_only', message: 'Only available on the computer running still. Use Download instead.' },
  });
}
