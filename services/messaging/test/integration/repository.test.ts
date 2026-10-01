// Integration tests against the platform's own PostgreSQL image, built from
// deploy/postgres by Testcontainers. Run: ./raadi test-integration
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import {
  MessagingRepository,
  type NewConversation,
} from '../../src/messaging/messaging.repository.js';

let container: StartedTestContainer;
let pool: pg.Pool;
let repo: MessagingRepository;

before(async () => {
  const image = await GenericContainer.fromDockerfile(
    new URL('../../../../../deploy/postgres', import.meta.url).pathname,
  ).build('raadi-postgres-test', { deleteOnExit: false });
  container = await image
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'messaging' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  pool = new pg.Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: 'postgres',
    password: 'test',
    database: 'messaging',
  });
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    await pool.query(sql.split('-- migrate:down')[0]!.replace('-- migrate:up', ''));
  }
  repo = new MessagingRepository(pool);
});

after(async () => {
  await pool?.end();
  await container?.stop();
});

const conversationFor = (overrides: Partial<NewConversation> = {}): NewConversation => ({
  listingId: randomUUID(),
  listingTitle: 'Racersykkel',
  listingImageId: null,
  sellerId: randomUUID(),
  sellerName: 'Kari N.',
  buyerId: randomUUID(),
  buyerName: 'Ola N.',
  ...overrides,
});

describe('MessagingRepository', () => {
  it('opens one conversation per listing and buyer, writing an event per message', async () => {
    const input = conversationFor();
    const first = await repo.start(input, 'Er den ledig?');
    const again = await repo.start(input, 'Hallo?');
    assert.equal(first.created, true);
    assert.equal(again.created, false);
    assert.equal(again.conversation.id, first.conversation.id);
    const { rows } = await pool.query(
      `SELECT event_type, payload FROM outbox WHERE aggregate_id = $1 ORDER BY created_at`,
      [first.conversation.id],
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].event_type, 'no.raadi.messaging.conversation.message_sent.v1');
    assert.equal(rows[0].payload.data.recipientId, input.sellerId);
    assert.ok(!JSON.stringify(rows[0].payload).includes('ledig'), 'no message text in events');
  });

  it('only lets participants send, read or mark read', async () => {
    const input = conversationFor();
    const { conversation } = await repo.start(input, 'Hei');
    const stranger = randomUUID();
    assert.equal(await repo.send(conversation.id, stranger, 'snoop'), null);
    assert.equal(await repo.inboxEntry(conversation.id, stranger), null);
    assert.equal(await repo.markRead(conversation.id, stranger), false);
    assert.ok(await repo.send(conversation.id, input.sellerId, 'Ja, den er ledig'));
  });

  it('counts unread messages per participant and clears them on read', async () => {
    const input = conversationFor();
    const { conversation } = await repo.start(input, 'Melding 1');
    await repo.send(conversation.id, input.buyerId, 'Melding 2');
    assert.equal(await repo.unreadTotal(input.sellerId), 2);
    assert.equal(await repo.unreadTotal(input.buyerId), 0);

    const sellerInbox = await repo.inbox(input.sellerId, 20, 0);
    assert.equal(sellerInbox.total, 1);
    assert.equal(Number(sellerInbox.rows[0]!.unread), 2);
    assert.equal(sellerInbox.rows[0]!.last_body, 'Melding 2');

    assert.equal(await repo.markRead(conversation.id, input.sellerId), true);
    assert.equal(await repo.unreadTotal(input.sellerId), 0);
    await repo.send(conversation.id, input.sellerId, 'Svar');
    assert.equal(await repo.unreadTotal(input.buyerId), 1);
  });

  it('pages history newest first with a time cursor', async () => {
    const input = conversationFor();
    const { conversation } = await repo.start(input, 'm1');
    for (const body of ['m2', 'm3', 'm4']) await repo.send(conversation.id, input.buyerId, body);
    const latest = await repo.messages(conversation.id, 2);
    assert.deepEqual(
      latest.map((m) => m.body),
      ['m4', 'm3'],
    );
    const older = await repo.messages(conversation.id, 10, latest[1]!.created_at.toISOString());
    assert.deepEqual(
      older.map((m) => m.body),
      ['m2', 'm1'],
    );
  });

  it('refuses a conversation with yourself', async () => {
    const id = randomUUID();
    await assert.rejects(repo.start(conversationFor({ sellerId: id, buyerId: id }), 'hi'));
  });
});
