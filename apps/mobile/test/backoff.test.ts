import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconnectDelay } from '../src/lib/backoff.ts';

describe('reconnectDelay', () => {
  it('doubles the ceiling per attempt, with jitter in the upper half', () => {
    assert.equal(
      reconnectDelay(0, () => 0),
      500,
    );
    assert.equal(
      reconnectDelay(0, () => 1),
      1000,
    );
    assert.equal(
      reconnectDelay(3, () => 1),
      8000,
    );
  });
  it('caps at 30 seconds', () => {
    assert.equal(
      reconnectDelay(20, () => 1),
      30_000,
    );
    assert.equal(
      reconnectDelay(20, () => 0),
      15_000,
    );
  });
});
