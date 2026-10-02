import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { WebhookRejected } from '../../src/payments/providers/provider.js';
import { formEncode, StripeProvider, statusOf } from '../../src/payments/providers/stripe.js';
import { VippsProvider } from '../../src/payments/providers/vipps.js';

const SECRET = 'unit-test-webhook-secret';

/** Signs like Vipps does (the same algorithm as payments-mock, written independently). */
function vippsHeaders(body: string, path: string, host: string, date = new Date()) {
  const hash = createHash('sha256').update(body).digest('base64');
  const msDate = date.toUTCString();
  const sig = createHmac('sha256', SECRET)
    .update(`POST\n${path}\n${msDate};${host};${hash}`)
    .digest('base64');
  return {
    'x-ms-date': msDate,
    'x-ms-content-sha256': hash,
    authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${sig}`,
  };
}

describe('Vipps webhooks', () => {
  const vipps = new VippsProvider({
    baseUrl: 'http://vipps.invalid',
    clientId: 'c',
    clientSecret: 's',
    subscriptionKey: 'k',
    merchantSerialNumber: '123456',
    webhookSecret: SECRET,
  });
  const path = '/api/v1/payments/webhooks/vipps';
  const host = 'payments:4000';
  const body = JSON.stringify({
    msn: '123456',
    reference: '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
    pspReference: 'psp-1',
    name: 'AUTHORIZED',
    amount: { currency: 'NOK', value: 4900 },
    timestamp: '2026-10-02T12:00:00Z',
  });
  const req = (b: string, headers: Record<string, string>) => ({
    path,
    host,
    headers,
    rawBody: Buffer.from(b),
  });

  it('accepts a correctly signed event and maps its name', () => {
    const e = vipps.verifyWebhook(req(body, vippsHeaders(body, path, host)));
    assert.equal(e?.outcome, 'authorized');
    assert.equal(e?.reference, '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f');
    // Identical deliveries share an id (exactly-once), different bodies do not.
    assert.equal(
      e?.eventId,
      vipps.verifyWebhook(req(body, vippsHeaders(body, path, host)))?.eventId,
    );
  });

  it('rejects tampered bodies, wrong hosts, bad signatures and stale dates', () => {
    const h = vippsHeaders(body, path, host);
    assert.throws(() => vipps.verifyWebhook(req(body.replace('4900', '1'), h)), WebhookRejected);
    assert.throws(
      () => vipps.verifyWebhook({ ...req(body, h), host: 'evil.example' }),
      WebhookRejected,
    );
    assert.throws(
      () =>
        vipps.verifyWebhook(req(body, { ...h, authorization: h.authorization.replace(/.$/, 'A') })),
      WebhookRejected,
    );
    const old = vippsHeaders(body, path, host, new Date(Date.now() - 10 * 60_000));
    assert.throws(() => vipps.verifyWebhook(req(body, old)), WebhookRejected);
  });

  it('ignores events Raadi does not act on', () => {
    const created = body.replace('AUTHORIZED', 'CREATED');
    assert.equal(vipps.verifyWebhook(req(created, vippsHeaders(created, path, host))), null);
  });
});

describe('Stripe', () => {
  const stripe = new StripeProvider({ secretKey: 'sk_test_x', webhookSecret: SECRET });
  const event = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', client_reference_id: 'order-1', payment_status: 'paid' } },
  });
  const sign = (b: string, t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${b}`).digest('hex')}`;
  const req = (b: string, sig: string) => ({
    path: '/api/v1/payments/webhooks/stripe',
    host: 'raadi.example',
    headers: { 'stripe-signature': sig },
    rawBody: Buffer.from(b),
  });

  it('verifies Stripe-Signature and maps checkout events', () => {
    assert.deepEqual(stripe.verifyWebhook(req(event, sign(event))), {
      eventId: 'evt_1',
      reference: 'order-1',
      outcome: 'captured',
    });
    assert.throws(() => stripe.verifyWebhook(req(event, sign(`${event} `))), WebhookRejected);
    const stale = Math.floor(Date.now() / 1000) - 600;
    assert.throws(() => stripe.verifyWebhook(req(event, sign(event, stale))), WebhookRejected);
  });

  it('maps checkout sessions (recorded shapes) to Raadi outcomes', () => {
    const base = { id: 'cs_1', client_reference_id: 'order-1', amount_total: 4900 };
    assert.equal(
      statusOf({ ...base, status: 'open', payment_status: 'unpaid', payment_intent: null }).outcome,
      'pending',
    );
    assert.equal(
      statusOf({ ...base, status: 'expired', payment_status: 'unpaid', payment_intent: null })
        .outcome,
      'expired',
    );
    const paid = {
      ...base,
      status: 'complete' as const,
      payment_status: 'paid' as const,
      payment_intent: {
        id: 'pi_1',
        status: 'succeeded',
        amount_received: 4900,
        latest_charge: { amount_refunded: 0 },
      },
    };
    assert.deepEqual(statusOf(paid), {
      outcome: 'captured',
      authorizedOre: 4900,
      capturedOre: 4900,
    });
    assert.equal(
      statusOf({
        ...paid,
        payment_intent: { ...paid.payment_intent, latest_charge: { amount_refunded: 4900 } },
      }).outcome,
      'refunded',
    );
  });

  it('form-encodes nested parameters with brackets', () => {
    assert.deepEqual(formEncode({ a: 1, line_items: { 0: { price_data: { currency: 'nok' } } } }), [
      'a=1',
      'line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=nok',
    ]);
  });
});
