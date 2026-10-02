import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type OrderStatus,
  promotionWindow,
  type ProviderOutcome,
  transition,
} from '../../src/payments/model.js';

describe('order state machine', () => {
  it('follows the happy path and the provider-captured shortcut', () => {
    assert.equal(transition('created', 'authorized'), 'authorized');
    assert.equal(transition('authorized', 'captured'), 'captured');
    assert.equal(transition('created', 'captured'), 'captured'); // Stripe Checkout
    assert.equal(transition('captured', 'refunded'), 'refunded');
  });

  it('maps cancellations, expiry and failures', () => {
    assert.equal(transition('created', 'aborted'), 'cancelled');
    assert.equal(transition('created', 'expired'), 'expired');
    assert.equal(transition('authorized', 'expired'), 'cancelled');
    assert.equal(transition('created', 'failed'), 'failed');
  });

  it('never moves backwards or out of a final state (duplicates, late events)', () => {
    const late: Array<[OrderStatus, ProviderOutcome]> = [
      ['authorized', 'authorized'],
      ['captured', 'authorized'],
      ['captured', 'captured'],
      ['captured', 'cancelled'],
      ['cancelled', 'authorized'],
      ['refunded', 'captured'],
      ['expired', 'authorized'],
      ['failed', 'captured'],
    ];
    for (const [from, outcome] of late)
      assert.equal(transition(from, outcome), null, `${from} + ${outcome}`);
  });
});

describe('promotion window', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const day = 86_400_000;
  it('starts now, or stacks after a running promotion', () => {
    assert.deepEqual(promotionWindow(null, now, 7), {
      startsAt: now,
      endsAt: new Date(now.getTime() + 7 * day),
    });
    const running = new Date(now.getTime() + 3 * day);
    assert.equal(promotionWindow(running, now, 7).endsAt.getTime(), now.getTime() + 10 * day);
    const ended = new Date(now.getTime() - day);
    assert.equal(promotionWindow(ended, now, 7).startsAt, now);
  });
});
