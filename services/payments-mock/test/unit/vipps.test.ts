import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { decide, modify, newPayment, PaymentError, signWebhook } from '../../src/vipps.js';

const payment = () =>
  newPayment({
    amount: { currency: 'NOK', value: 4900 },
    paymentMethod: { type: 'WALLET' },
    reference: 'order-0d7c1f3e-9a51',
    returnUrl: 'http://raadi.localhost/en/payments/x',
    userFlow: 'WEB_REDIRECT',
    paymentDescription: 'Promote listing',
  });

describe('mock ePayment rules', () => {
  it('authorizes, captures and refunds within the amounts', () => {
    const p = payment();
    assert.equal(decide(p, true), 'AUTHORIZED');
    assert.throws(() => modify(p, 'capture', 5000), PaymentError);
    assert.equal(modify(p, 'capture', 4900), 'CAPTURED');
    assert.throws(() => modify(p, 'refund', 5000), PaymentError);
    assert.equal(modify(p, 'refund', 4900), 'REFUNDED');
  });

  it('cannot be decided twice; declined or unanswered payments cannot be captured', () => {
    const p = payment();
    assert.equal(decide(p, false), 'ABORTED');
    assert.throws(() => decide(p, true), PaymentError);
    assert.throws(() => modify(p, 'capture', 100), PaymentError);
    const q = payment();
    assert.equal(modify(q, 'cancel'), 'TERMINATED');
  });
});

describe('webhook signature (Vipps scheme)', () => {
  it('signs method, path, date, host and the body hash', () => {
    const url = new URL('http://payments:4000/api/v1/payments/webhooks/vipps');
    const body = '{"name":"AUTHORIZED"}';
    const date = new Date('2026-10-02T12:00:00Z');
    const h = signWebhook('secret-secret-secret', url, body, date);
    const hash = createHash('sha256').update(body).digest('base64');
    assert.equal(h['x-ms-content-sha256'], hash);
    const expected = createHmac('sha256', 'secret-secret-secret')
      .update(`POST\n/api/v1/payments/webhooks/vipps\n${date.toUTCString()};payments:4000;${hash}`)
      .digest('base64');
    assert.equal(
      h.authorization,
      `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${expected}`,
    );
  });
});
