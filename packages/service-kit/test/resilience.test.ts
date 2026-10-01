import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { circuitBreaker, retry } from '../src/resilience.js';

describe('retry', () => {
  it('retries until success', async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('flaky');
        return 'ok';
      },
      { retries: 5, baseDelayMs: 1 },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('gives up after the configured attempts', async () => {
    let calls = 0;
    await assert.rejects(
      retry(
        async () => {
          calls++;
          throw new Error('down');
        },
        { retries: 2, baseDelayMs: 1 },
      ),
      /down/,
    );
    assert.equal(calls, 3);
  });

  it('stops early when shouldRetry returns false', async () => {
    let calls = 0;
    await assert.rejects(
      retry(
        async () => {
          calls++;
          throw new Error('400');
        },
        { retries: 5, baseDelayMs: 1, shouldRetry: () => false },
      ),
    );
    assert.equal(calls, 1);
  });
});

describe('circuitBreaker', () => {
  it('opens after repeated failures and fails fast', async () => {
    let calls = 0;
    const { fire, breaker } = circuitBreaker(
      async () => {
        calls++;
        throw new Error('boom');
      },
      { name: 'test', volumeThreshold: 2, errorThresholdPercentage: 50, resetTimeoutMs: 60_000 },
    );
    for (let i = 0; i < 3; i++) await fire().catch(() => undefined);
    assert.equal(breaker.opened, true);
    const before = calls;
    await assert.rejects(fire(), /Breaker is open/);
    assert.equal(calls, before);
    breaker.shutdown();
  });
});
