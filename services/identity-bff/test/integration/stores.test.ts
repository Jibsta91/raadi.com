// Integration tests against real PostgreSQL and Valkey (Testcontainers).
// Run with: ./raadi test-integration   (needs the Docker socket)
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Redis } from 'iovalkey';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { SessionStore, type SessionData } from '../../src/auth/session.store.js';
import { buildConfig, envSchema } from '../../src/config.js';
import { UsersRepository } from '../../src/users/users.repository.js';

let pgc: StartedPostgreSqlContainer;
let vkc: StartedTestContainer;
let pool: pg.Pool;
let valkey: Redis;

before(async () => {
  [pgc, vkc] = await Promise.all([
    new PostgreSqlContainer('postgres:17.11-trixie').start(),
    new GenericContainer('valkey/valkey:9.0.6-alpine3.24').withExposedPorts(6379).start(),
  ]);
  pool = new pg.Pool({ connectionString: pgc.getConnectionUri() });
  const migration = readFileSync(
    new URL('../../../migrations/20260101000000_user_profiles_and_outbox.sql', import.meta.url),
    'utf8',
  );
  await pool.query(migration.split('-- migrate:down')[0]!.replace('-- migrate:up', ''));
  valkey = new Redis({ host: vkc.getHost(), port: vkc.getMappedPort(6379) });
});

after(async () => {
  await pool?.end();
  valkey?.disconnect();
  await Promise.all([pgc?.stop(), vkc?.stop()]);
});

describe('UsersRepository', () => {
  it('registers on first login and emits exactly one outbox event', async () => {
    const repo = new UsersRepository(pool);
    const id = randomUUID();
    const first = await repo.recordLogin({
      id,
      email: 'a@raadi.localhost',
      displayName: 'A',
      locale: 'so',
    });
    const second = await repo.recordLogin({ id, email: 'a@raadi.localhost', locale: 'nb' });
    assert.equal(first.registered, true);
    assert.equal(second.registered, false);
    assert.equal(second.profile.locale, 'so', 'locale preference is not overwritten on login');
    const { rows } = await pool.query(
      'SELECT event_type, payload FROM outbox WHERE aggregate_id = $1',
      [id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].event_type, 'no.raadi.identity.user.registered.v1');
    assert.equal(
      JSON.stringify(rows[0].payload).includes('a@raadi.localhost'),
      false,
      'no PII in events',
    );
  });

  it('updates preferences transactionally with an event', async () => {
    const repo = new UsersRepository(pool);
    const id = randomUUID();
    await repo.recordLogin({ id, email: 'b@raadi.localhost', locale: 'nb' });
    const updated = await repo.updatePreferences(id, { locale: 'en' });
    assert.equal(updated?.locale, 'en');
    const { rows } = await pool.query(
      "SELECT 1 FROM outbox WHERE aggregate_id = $1 AND event_type LIKE '%preferences%'",
      [id],
    );
    assert.equal(rows.length, 1);
  });
});

describe('SessionStore (Valkey)', () => {
  const cfg = () =>
    buildConfig(
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

  it('stores encrypted sessions and destroys them', async () => {
    const store = new SessionStore(valkey, cfg());
    const data: SessionData = {
      user: { id: randomUUID(), email: 'c@raadi.localhost', locale: 'nb', roles: ['user'] },
      accessToken: 'access-token-value',
      accessExpiresAt: Math.floor(Date.now() / 1000) + 300,
      createdAt: Math.floor(Date.now() / 1000),
    };
    const id = await store.create(data, 60);
    assert.deepEqual(await store.get(id), data);
    const raw = (await valkey.keys('bff:sess:*')).map((k) => k);
    assert.ok(
      raw.every((k) => !k.includes(id)),
      'raw session id never used as key',
    );
    const stored = await valkey.get(raw[0]!);
    assert.ok(!stored!.includes('access-token-value'), 'tokens are encrypted at rest');
    await store.destroy(id);
    assert.equal(await store.get(id), null);
  });

  it('login transactions are single-use', async () => {
    const store = new SessionStore(valkey, cfg());
    await store.putLoginTransaction('state-abcdefghijklmnop', {
      codeVerifier: 'v',
      nonce: 'n',
      returnTo: '/',
    });
    assert.ok(await store.takeLoginTransaction('state-abcdefghijklmnop'));
    assert.equal(await store.takeLoginTransaction('state-abcdefghijklmnop'), null);
  });

  it('refresh lock admits one holder at a time', async () => {
    const store = new SessionStore(valkey, cfg());
    let release!: () => void;
    const first = store.withRefreshLock(
      'sid',
      () => new Promise<string>((r) => (release = () => r('done'))),
    );
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(await store.withRefreshLock('sid', async () => 'second'), null);
    release();
    assert.equal(await first, 'done');
  });
});
