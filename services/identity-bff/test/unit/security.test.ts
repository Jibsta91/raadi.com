import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isCsrfSafe,
  keycloakUiLocale,
  normaliseLocale,
  safeReturnTo,
} from '../../src/auth/security.js';

describe('safeReturnTo', () => {
  it('keeps same-site relative paths', () => {
    assert.equal(safeReturnTo('/nb/account?tab=1#x'), '/nb/account?tab=1#x');
  });
  for (const evil of [
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/a\nb',
    '',
    42,
  ]) {
    it(`rejects ${JSON.stringify(evil)}`, () => assert.equal(safeReturnTo(evil, '/nb'), '/nb'));
  }
});

describe('locales', () => {
  it('normalises unknown locales to nb', () => {
    assert.equal(normaliseLocale('so'), 'so');
    assert.equal(normaliseLocale('de'), 'nb');
  });
  it('maps to Keycloak bundles', () => {
    assert.equal(keycloakUiLocale('nb'), 'no');
    assert.equal(keycloakUiLocale('so'), 'en');
  });
});

describe('isCsrfSafe', () => {
  const allowed = ['http://raadi.localhost', 'https://raadi.localhost'];
  it('allows safe methods', () => assert.ok(isCsrfSafe('GET', {}, allowed)));
  it('allows same-origin unsafe requests', () =>
    assert.ok(isCsrfSafe('POST', { origin: 'http://raadi.localhost' }, allowed)));
  it('rejects cross-origin unsafe requests', () =>
    assert.ok(!isCsrfSafe('PATCH', { origin: 'https://evil.example' }, allowed)));
  it('falls back to Sec-Fetch-Site', () => {
    assert.ok(isCsrfSafe('DELETE', { 'sec-fetch-site': 'same-origin' }, allowed));
    assert.ok(!isCsrfSafe('DELETE', { 'sec-fetch-site': 'cross-site' }, allowed));
  });
  it('rejects unsafe requests without any origin signal', () =>
    assert.ok(!isCsrfSafe('POST', {}, allowed)));
});
