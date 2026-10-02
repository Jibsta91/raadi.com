// Contract test: responses built by the service must satisfy openapi.yaml,
// the same document that generates @raadi/api-client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { summarise, toReview, toVerification } from '../../src/trust/model.js';

const spec = parse(readFileSync(new URL('../../../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema({ $id: 'spec', components: spec.components });
const valid = (name: string, value: unknown) => {
  const validate = ajv.compile({ $ref: `spec#/components/schemas/${name}` });
  assert.ok(validate(value), `${name}: ${JSON.stringify(validate.errors)}`);
};

describe('OpenAPI contract', () => {
  const review = toReview({
    id: '0d7c1f3e-9a51-4c47-8f0e-1c2b3a4d5e6f',
    listing_id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
    listing_title: 'Sykkel',
    reviewer_id: '8b2d6c1a-4e3f-4a5b-9c7d-2e1f0a9b8c7d',
    reviewer_name: 'Ola N.',
    subject_id: '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
    subject_role: 'seller',
    rating: 5,
    comment: 'Rask og hyggelig handel.',
    created_at: new Date('2026-10-02T10:00:00Z'),
    removed_at: null,
    removed_by: null,
  });
  const verification = toVerification({
    user_id: '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
    method: 'bankid',
    verified_at: new Date('2026-10-02T09:00:00Z'),
  });
  const rating = summarise([{ rating: 5, n: 1 }]);

  it('Review, Profile and TrustSummary', () => {
    valid('Review', review);
    const summary = { userId: review.listing.id, name: 'Kari N.', verification, rating };
    valid('TrustSummary', summary);
    valid('TrustSummary', { ...summary, verification: null, rating: summarise([]) });
    valid('Profile', {
      ...summary,
      reviews: { total: 1, limit: 20, offset: 0, items: [review] },
    });
  });

  it('Eligibility (both shapes)', () => {
    valid('Eligibility', {
      canReview: true,
      subjectRole: 'buyer',
      deadline: '2026-10-31T12:00:00.000Z',
    });
    valid('Eligibility', { canReview: false, reason: 'not_sold' });
  });
});
