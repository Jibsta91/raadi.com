// Integration tests against the platform's own PostgreSQL image (PostGIS),
// built from deploy/postgres by Testcontainers. Run: ./raadi test-integration
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import {
  ListingsRepository,
  VersionConflictError,
} from '../../src/listings/listings.repository.js';

let container: StartedTestContainer;
let pool: pg.Pool;

before(async () => {
  const image = await GenericContainer.fromDockerfile(
    new URL('../../../../../deploy/postgres', import.meta.url).pathname,
  ).build('raadi-postgres-test', { deleteOnExit: false });
  container = await image
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'listings' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  pool = new pg.Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: 'postgres',
    password: 'test',
    database: 'listings',
  });
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    await pool.query(sql.split('-- migrate:down')[0]!.replace('-- migrate:up', ''));
  }
});

after(async () => {
  await pool?.end();
  await container?.stop();
});

const input = (id: string = randomUUID()) => ({
  id,
  ownerId: randomUUID(),
  sellerName: 'Kari N.',
  category: 'torget' as const,
  subcategory: 'sport',
  title: 'Langrennsski',
  description: 'Lite brukt',
  priceNok: 1500,
  attributes: { condition: 'good' },
  placeId: 'tromso',
  imageIds: [],
});

async function events(id: string) {
  const { rows } = await pool.query<{
    event_type: string;
    aggregate_type: string;
    payload: { data: Record<string, unknown> };
  }>(
    'SELECT event_type, aggregate_type, payload FROM outbox WHERE aggregate_id = $1 ORDER BY created_at',
    [id],
  );
  return rows;
}

describe('ListingsRepository', () => {
  it('creates a listing with a PostGIS location and a published event in one transaction', async () => {
    const repo = new ListingsRepository(pool);
    const row = (await repo.create(input()))!;
    assert.equal(row.version, 1);
    assert.ok(Math.abs(row.lat - 69.6492) < 1e-6 && Math.abs(row.lon - 18.9553) < 1e-6);
    const [event] = await events(row.id);
    assert.equal(event!.event_type, 'no.raadi.listings.listing.published.v1');
    assert.equal(event!.aggregate_type, 'listing');
    assert.equal(
      JSON.stringify(event!.payload).includes('Kari'),
      false,
      'no seller name in events',
    );
  });

  it('rolls back the listing when the before-commit hook fails (e.g. OpenFGA down)', async () => {
    const repo = new ListingsRepository(pool);
    const id = randomUUID();
    await assert.rejects(
      repo.create(input(id), async () => {
        throw new Error('openfga unavailable');
      }),
    );
    assert.equal(await repo.findById(id), null);
    assert.equal((await events(id)).length, 0);
  });

  it('updates with optimistic concurrency and emits updated/deleted events', async () => {
    const repo = new ListingsRepository(pool);
    const created = (await repo.create(input()))!;
    const next = { ...input(created.id), title: 'Langrennsski, solgt', status: 'sold' as const };
    const updated = await repo.update(created.id, 1, next);
    assert.equal(updated.version, 2);
    assert.equal(updated.status, 'sold');
    await assert.rejects(repo.update(created.id, 1, next), VersionConflictError);
    const deleted = await repo.softDelete(created.id, 'moderation');
    assert.equal(deleted?.status, 'deleted');
    assert.equal(await repo.softDelete(created.id, 'owner'), null, 'deleting twice is a no-op');
    const all = await events(created.id);
    assert.deepEqual(
      all.map((e) => e.event_type.split('.').at(-2)),
      ['published', 'updated', 'deleted'],
    );
    assert.equal(all[2]!.payload.data.reason, 'moderation');
    assert.equal(all[2]!.payload.data.ownerId, created.owner_id);
  });

  it('seeding is idempotent', async () => {
    const repo = new ListingsRepository(pool);
    const batch = [input(), input()];
    assert.equal((await repo.createMany(batch)).length, 2);
    assert.equal((await repo.createMany(batch)).length, 0);
  });
});
