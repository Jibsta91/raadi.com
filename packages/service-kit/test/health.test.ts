import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HealthRegistry } from '../src/health.js';

describe('HealthRegistry', () => {
  it('reports ok when all checks pass', async () => {
    const h = new HealthRegistry();
    h.register('db', async () => undefined);
    const r = await h.readiness();
    assert.equal(r.status, 'ok');
    assert.equal(r.checks.db?.status, 'ok');
  });

  it('reports error and the reason when a check fails or times out', async () => {
    const h = new HealthRegistry();
    h.register('cache', async () => {
      throw new Error('connection refused');
    });
    h.register('slow', () => new Promise((resolve) => setTimeout(resolve, 200)));
    const r = await h.readiness(20);
    assert.equal(r.status, 'error');
    assert.equal(r.checks.cache?.error, 'connection refused');
    assert.equal(r.checks.slow?.error, 'timeout');
  });

  it('reports draining during shutdown', async () => {
    const h = new HealthRegistry();
    h.startDraining();
    assert.equal((await h.readiness()).status, 'draining');
  });
});
