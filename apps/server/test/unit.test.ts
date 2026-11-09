import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { durationAcceptable, reserveOutputPath } from '../src/exports/queue.ts';
import { buildMuxArgs, buildSegmentArgs, ProgressParser, type RenderInput } from '../src/media/render.ts';
import { isAllowedHost, isAllowedOrigin, isPrivateIPv4 } from '../src/middleware/security.ts';
import { safeJoin } from '../src/storage/fs.ts';

describe('FFmpeg progress parsing', () => {
  it('parses blocks split across chunks and ignores N/A', () => {
    const p = new ProgressParser();
    expect(p.push('frame=10\nout_time_us=N/A\nprog')).toBe(false);
    expect(p.outTime).toBe(0);
    expect(p.push('ress=continue\n')).toBe(true);
    p.push('out_time_us=1500000\nout_time_ms=1500000\nout_time=00:00:01.500000\nprogress=continue\n');
    expect(p.outTime).toBe(1.5);
    expect(p.fraction(3)).toBe(0.5);
    p.push('out_time_us=9000000\r\nprogress=end\r\n');
    expect(p.ended).toBe(true);
    expect(p.fraction(3)).toBe(1); // clamped
    expect(p.fraction(0)).toBe(0);
  });
});

describe('render command construction', () => {
  const input: RenderInput = {
    artworkPng: 'C:\\tmp\\sq.png',
    audioFile: 'C:\\a b\\beat "x".wav',
    audioCodec: 'pcm_s24le',
    duration: 187.3,
    sampleRate: 48000,
    quality: 'high',
    segmentPath: 'C:\\tmp\\seg.mp4',
    output: 'C:\\out\\.partial.mp4',
  };

  it('places the artwork at x=420 on a 1920×1080 black canvas at 30 fps', () => {
    const args = buildSegmentArgs(input);
    const filter = args[args.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('pad=1920:1080:420:0:color=black');
    expect(filter).toContain('out_color_matrix=bt709');
    expect(args).toContain('libx264');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
  });

  it('keeps paths as single arguments (no shell) and cuts to the exact audio length', () => {
    const args = buildMuxArgs(input);
    expect(args).toContain('C:\\a b\\beat "x".wav');
    expect(args[args.indexOf('-t') + 1]).toBe('187.300000');
    expect(args).toContain('+faststart');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args).not.toContain('-ar');
  });

  it('passes AAC through, resamples only above 96 kHz', () => {
    const copy = buildMuxArgs({ ...input, audioCodec: 'aac' });
    expect(copy[copy.indexOf('-c:a') + 1]).toBe('copy');
    const hi = buildMuxArgs({ ...input, sampleRate: 192000 });
    expect(hi[hi.indexOf('-ar') + 1]).toBe('48000');
    expect(buildMuxArgs({ ...input, quality: 'maximum' })).toContain('twoloop');
  });
});

describe('output paths', () => {
  it('reserves unique names without overwriting', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'still-out-'));
    await fs.writeFile(path.join(dir, 'Beat.mp4'), 'existing');
    const a = await reserveOutputPath(dir, 'Beat');
    const b = await reserveOutputPath(dir, 'Beat');
    expect(path.basename(a)).toBe('Beat (2).mp4');
    expect(path.basename(b)).toBe('Beat (3).mp4');
    expect(await fs.readFile(path.join(dir, 'Beat.mp4'), 'utf8')).toBe('existing');
    await fs.rm(dir, { recursive: true });
  });

  it('accepts output durations within codec tolerance only', () => {
    expect(durationAcceptable(180, 180.02)).toBe(true);
    expect(durationAcceptable(3, 3.2)).toBe(true);
    expect(durationAcceptable(180, 178)).toBe(false);
  });
});

describe('security helpers', () => {
  it('blocks path traversal', () => {
    const root = path.resolve('/data/projects');
    expect(safeJoin(root, 'abc', 'project.json')).toBe(path.join(root, 'abc', 'project.json'));
    expect(() => safeJoin(root, '..', 'secret')).toThrow();
    expect(() => safeJoin(root, 'a/../../x')).toThrow();
  });

  it('recognises local origins only', () => {
    expect(isAllowedOrigin('http://localhost:5173', false)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4317', false)).toBe(true);
    expect(isAllowedOrigin('https://evil.com', false)).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.com', false)).toBe(false);
    expect(isAllowedOrigin('null', false)).toBe(false);
    expect(isAllowedOrigin('http://192.168.0.12:4317', false)).toBe(false);
  });

  it('opens to private IPs only in LAN mode', () => {
    expect(isAllowedOrigin('http://192.168.0.12:4317', true)).toBe(true);
    expect(isAllowedHost('10.0.0.5', true)).toBe(true);
    expect(isAllowedHost('172.20.1.1', true)).toBe(true);
    expect(isAllowedHost('172.32.1.1', true)).toBe(false);
    expect(isAllowedHost('8.8.8.8', true)).toBe(false);
    expect(isAllowedHost('evil.com', true)).toBe(false); // hostnames refused: DNS rebinding
    expect(isPrivateIPv4('192.168.1.300')).toBe(false);
  });
});
