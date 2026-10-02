import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type DealFacts,
  decideEligibility,
  type ListingRow,
  safeReturnTo,
  summarise,
  withOutcome,
} from '../../src/trust/model.js';
import { identityHash } from '../../src/trust/bankid.js';

const seller = '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11';
const buyer = '8b2d6c1a-4e3f-4a5b-9c7d-2e1f0a9b8c7d';
const stranger = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const soldAt = new Date('2026-10-01T12:00:00Z');
const day = 86_400_000;

const listing = (over: Partial<ListingRow> = {}): ListingRow => ({
  id: '6f1c4a52-2a43-4d0d-9b55-2f1f1b0e5a11',
  owner_id: seller,
  title: 'Sykkel',
  status: 'sold',
  sold_at: soldAt,
  version: 3,
  ...over,
});
const facts = (over: Partial<DealFacts> = {}): DealFacts => ({
  listing: listing(),
  reviewerWrote: true,
  subjectWrote: true,
  alreadyReviewed: false,
  ...over,
});
const decide = (reviewer: string, subject: string, f: DealFacts, now = soldAt.getTime() + day) =>
  decideEligibility(reviewer, subject, f, new Date(now), 30);

describe('review eligibility', () => {
  it('lets buyer and seller review each other after a sale', () => {
    assert.deepEqual(decide(buyer, seller, facts()), {
      canReview: true,
      subjectRole: 'seller',
      deadline: new Date(soldAt.getTime() + 30 * day).toISOString(),
    });
    const back = decide(seller, buyer, facts());
    assert.equal(back.canReview, true);
    assert.equal(back.canReview && back.subjectRole, 'buyer');
  });

  it('refuses everything that is not a finished deal between the two', () => {
    const reason = (e: ReturnType<typeof decide>) => (e.canReview ? 'ok' : e.reason);
    assert.equal(reason(decide(buyer, buyer, facts())), 'self');
    assert.equal(reason(decide(buyer, seller, facts({ listing: null }))), 'unknown_listing');
    // Two buyers of the same listing are not a deal.
    assert.equal(reason(decide(buyer, stranger, facts())), 'not_party');
    assert.equal(reason(decide(buyer, seller, facts({ subjectWrote: false }))), 'no_conversation');
    assert.equal(reason(decide(buyer, seller, facts({ reviewerWrote: false }))), 'no_conversation');
    assert.equal(
      reason(decide(buyer, seller, facts({ listing: listing({ status: 'active', sold_at: null }) }))),
      'not_sold',
    );
    assert.equal(reason(decide(buyer, seller, facts(), soldAt.getTime() + 31 * day)), 'window_closed');
    assert.equal(reason(decide(buyer, seller, facts({ alreadyReviewed: true }))), 'already_reviewed');
  });

  it('still allows reviews when a sold listing was deleted afterwards', () => {
    const e = decide(buyer, seller, facts({ listing: listing({ status: 'deleted' }) }));
    assert.equal(e.canReview, true);
  });
});

describe('rating summary', () => {
  it('averages with one decimal and keeps the distribution', () => {
    assert.deepEqual(
      summarise([
        { rating: 5, n: 2 },
        { rating: 4, n: 1 },
      ]),
      { average: 4.7, count: 3, distribution: [0, 0, 0, 1, 2] },
    );
    assert.deepEqual(summarise([]), { average: null, count: 0, distribution: [0, 0, 0, 0, 0] });
  });
});

describe('verification redirects', () => {
  it('only returns to same-site paths', () => {
    assert.equal(safeReturnTo('/en/account', '/'), '/en/account');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/a\nb', 42, undefined]) {
      assert.equal(safeReturnTo(bad, '/nb/account'), '/nb/account', String(bad));
    }
  });

  it('appends the outcome before any fragment', () => {
    assert.equal(withOutcome('/en/account', 'ok'), '/en/account?verification=ok');
    assert.equal(withOutcome('/en/account?x=1#top', 'taken'), '/en/account?x=1&verification=taken#top');
  });

  it('hashes identities per provider with a secret key', () => {
    const a = identityHash('k'.repeat(32), 'https://bankid.example', 'sub-1');
    assert.deepEqual(a, identityHash('k'.repeat(32), 'https://bankid.example', 'sub-1'));
    assert.notDeepEqual(a, identityHash('k'.repeat(32), 'https://other.example', 'sub-1'));
    assert.notDeepEqual(a, identityHash('x'.repeat(32), 'https://bankid.example', 'sub-1'));
  });
});
