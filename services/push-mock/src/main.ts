import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loggerOptions } from '@raadi/service-kit/logger';
import { pino } from 'pino';
import { PushInbox } from './push.js';

const log = pino(loggerOptions('push-mock'));
const inbox = new PushInbox();
const port = Number(process.env.PORT ?? 4000);
const MAX_BODY = 1_000_000;

function reply(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Development stand-in for the Expo push service (ADR-0025). Notifications
 * POSTs here instead of https://exp.host; tests read what arrived from
 * GET /messages. Nothing leaves the machine.
 */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://push-mock');
  void (async () => {
    if (url.pathname === '/livez' || url.pathname === '/readyz')
      return reply(res, 200, { status: 'ok' });
    if (url.pathname === '/--/api/v2/push/send' && req.method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        return reply(res, 400, { errors: [{ code: 'VALIDATION_ERROR', message: 'invalid JSON' }] });
      }
      const result = inbox.send(body);
      if ('errors' in result) return reply(res, 400, result);
      const failed = result.data.filter((t) => t.status === 'error').length;
      log.info({ tickets: result.data.length, failed }, 'push request');
      return reply(res, 200, result);
    }
    if (url.pathname === '/messages' && req.method === 'GET') {
      return reply(res, 200, { messages: inbox.list(url.searchParams.get('to') ?? undefined) });
    }
    if (url.pathname === '/messages' && req.method === 'DELETE') {
      inbox.clear();
      return reply(res, 204);
    }
    return reply(res, 404, { errors: [{ code: 'NOT_FOUND', message: 'not found' }] });
  })().catch((err: unknown) => {
    log.error({ err }, 'request failed');
    if (!res.headersSent) reply(res, 500, { errors: [{ code: 'INTERNAL', message: 'error' }] });
  });
});

server.listen(port, () => log.info({ port }, 'push mock listening'));

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
