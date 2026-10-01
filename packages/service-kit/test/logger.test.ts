import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { loggerOptions, requestId } from '../src/logger.js';

describe('logger', () => {
  it('redacts credentials', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = pino(loggerOptions('test'), sink);
    log.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' } },
        user: { password: 'x' },
      },
      'hi',
    );
    const entry = JSON.parse(lines[0]!);
    assert.equal(entry.req.headers.authorization, '[redacted]');
    assert.equal(entry.req.headers.cookie, '[redacted]');
    assert.equal(entry.user.password, '[redacted]');
    assert.equal(entry.level, 'info');
    assert.equal(entry.service, 'test');
  });

  it('accepts sane request ids and replaces unsafe ones', () => {
    const ok = requestId({
      headers: { 'x-request-id': 'abc-123-def-456' },
    } as unknown as IncomingMessage);
    assert.equal(ok, 'abc-123-def-456');
    const replaced = requestId({
      headers: { 'x-request-id': 'bad id\n' },
    } as unknown as IncomingMessage);
    assert.match(replaced, /^[0-9a-f-]{36}$/);
  });
});
