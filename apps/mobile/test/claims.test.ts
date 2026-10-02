import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { needsRefresh, readClaims } from '../src/lib/claims.ts';

const jwt = (payload: object) =>
  `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

describe('readClaims', () => {
  it('reads display claims, including non-ASCII names', () => {
    const claims = readClaims(
      jwt({ sub: 'u1', email: 'kari@raadi.localhost', name: 'Kåre Ø', exp: 10 }),
    );
    assert.deepEqual(claims, {
      sub: 'u1',
      email: 'kari@raadi.localhost',
      name: 'Kåre Ø',
      locale: undefined,
      exp: 10,
    });
  });
  it('rejects tokens without a subject or with a broken payload', () => {
    assert.equal(readClaims(jwt({ email: 'x' })), null);
    assert.equal(readClaims('a.%%%.c'), null);
    assert.equal(readClaims('nodots'), null);
  });
});

describe('needsRefresh', () => {
  it('refreshes within 30 seconds of expiry', () => {
    assert.equal(needsRefresh(1_000_000 + 29_000, 1_000_000), true);
    assert.equal(needsRefresh(1_000_000 + 60_000, 1_000_000), false);
  });
});
