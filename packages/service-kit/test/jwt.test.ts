import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { displayName, JwtVerifier } from '../src/jwt.js';

const ISSUER = 'http://auth.raadi.localhost/realms/raadi';
let server: Server;
let privateKey: CryptoKey;
let verifier: JwtVerifier;

before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  verifier = new JwtVerifier({
    issuer: ISSUER,
    jwksUrl: `http://127.0.0.1:${port}/certs`,
    audience: 'raadi-api',
  });
});

after(() => server.close());

const sign = (
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: string } = {},
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('11111111-2222-3333-4444-555555555555')
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? 'raadi-api')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);

describe('JwtVerifier', () => {
  it('accepts a valid token and extracts roles', async () => {
    const token = await sign({
      email: 'kari@raadi.localhost',
      realm_access: { roles: ['user', 'moderator'] },
    });
    const p = await verifier.verify(token);
    assert.equal(p.email, 'kari@raadi.localhost');
    assert.deepEqual(p.roles, ['user', 'moderator']);
  });

  it('rejects a token for another audience', async () => {
    await assert.rejects(verifier.verify(await sign({}, { aud: 'someone-else' })));
  });

  it('rejects a token from another issuer', async () => {
    await assert.rejects(
      verifier.verify(await sign({}, { iss: 'http://evil.example/realms/raadi' })),
    );
  });

  it('rejects an expired token', async () => {
    await assert.rejects(verifier.verify(await sign({}, { exp: '-10m' })));
  });
});

describe('displayName', () => {
  it('uses the given name and family initial, never the e-mail', () => {
    assert.equal(
      displayName({ given_name: 'Kari', family_name: 'nordmann', email: 'k@x' }),
      'Kari N.',
    );
    assert.equal(displayName({ given_name: 'Amina' }), 'Amina');
    assert.equal(displayName({ email: 'k@x' }), 'Raadi-bruker');
  });
});
