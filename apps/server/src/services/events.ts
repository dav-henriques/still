import type { Request, Response } from 'express';
import type { ServerEvent } from '@still/shared';

/** Server-Sent Events hub: one long-lived response per open tab. */
export class EventHub {
  private clients = new Set<Response>();

  handler = (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    this.clients.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
  };

  emit(event: ServerEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) res.write(payload);
  }

  closeAll() {
    for (const res of this.clients) res.end();
    this.clients.clear();
  }
}
