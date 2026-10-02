// Contract test: responses built by the service must satisfy openapi.yaml,
// the same document that generates @raadi/api-client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { type OrderRow, toOrder } from '../../src/payments/model.js';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });
const valid = (name: string, value: unknown) => {
  const validate = ajv.compile({ $ref: `spec#/components/schemas/${name}` });
  assert.ok(validate(value), `${name}: ${JSON.stringify(validate.errors)}`);
};

describe('OpenAPI contract', () => {
  it('Order (open and captured)', () => {
    const row: OrderRow = {
      id: '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
      user_id: '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
      listing_id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
      product: 'promote_7d',
      amount_ore: 4900,
      currency: 'NOK',
      provider: 'vipps',
      provider_ref: '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
      redirect_url: 'http://pay.raadi.localhost/pay/x',
      status: 'created',
      idempotency_key: 'abcdefgh',
      request_hash: 'x',
      created_at: new Date(),
      updated_at: new Date(),
    };
    const open = toOrder(row);
    assert.equal(open.redirectUrl, 'http://pay.raadi.localhost/pay/x');
    valid('Order', open);
    const done = toOrder({ ...row, status: 'captured' }, new Date('2026-10-09T12:00:00Z'));
    assert.equal(done.redirectUrl, null, 'no payment link once the order is settled');
    valid('Order', done);
    valid('OrderList', { items: [open, done] });
  });
});
