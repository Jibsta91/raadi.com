import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { SessionStore } from '../../src/auth/session.store.js';
import { buildConfig, envSchema } from '../../src/config.js';

const cfg = buildConfig(
  envSchema.parse({
    PUBLIC_BASE_URL: 'http://raadi.localhost',
    AUTH_BASE_URL: 'http://auth.raadi.localhost',
  }),
  {
    dbPassword: 'x'.repeat(16),
    oidcClientSecret: 'y'.repeat(16),
    sessionKey: randomBytes(32),
    valkeyPassword: 'z'.repeat(16),
  },
);
const store = new SessionStore({} as never, cfg);

describe('session encryption', () => {
  it('round-trips', () => {
    const enc = store.encrypt('{"a":1}', 'k1');
    assert.equal(store.decrypt(enc, 'k1'), '{"a":1}');
  });
  it('binds ciphertext to its key (AAD)', () => {
    const enc = store.encrypt('secret', 'k1');
    assert.throws(() => store.decrypt(enc, 'k2'));
  });
  it('detects tampering', () => {
    const buf = Buffer.from(store.encrypt('secret', 'k1'), 'base64url');
    buf[buf.length - 1]! ^= 1;
    assert.throws(() => store.decrypt(buf.toString('base64url'), 'k1'));
  });
  it('issues 256-bit url-safe ids', () => assert.match(store.newId(), /^[\w-]{43}$/));
});

describe('config', () => {
  it('derives issuer, cookie security and allowed origins', () => {
    assert.equal(cfg.issuer, 'http://auth.raadi.localhost/realms/raadi');
    assert.equal(cfg.cookieSecure, false);
    assert.deepEqual(cfg.allowedOrigins, ['http://raadi.localhost', 'https://raadi.localhost']);
  });
});
