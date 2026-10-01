// The event-to-e-mail pipeline against the platform's PostgreSQL image, with a
// fake mail transport and user directory. Run: ./raadi test-integration
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { buildEvent } from '@raadi/events';
import type { ReceivedEvent } from '@raadi/service-kit/kafka';
import type { Transporter } from 'nodemailer';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { AppConfig } from '../../src/config.js';
import type { UserDirectory } from '../../src/notifications/directory.js';
import { NotificationsRepository } from '../../src/notifications/notifications.repository.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';

let container: StartedTestContainer;
let pool: pg.Pool;
let repo: NotificationsRepository;
let service: NotificationsService;
const sent: Array<{ to: string; subject: string; text: string }> = [];
let failSends = 0;

const directory = {
  recipient: async (userId: string) =>
    userId === GONE ? null : { email: `${userId}@example.test`, locale: 'nb' as const },
} as unknown as UserDirectory;
const mailer = {
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    if (failSends > 0) {
      failSends--;
      throw new Error('SMTP down');
    }
    sent.push(m);
    return {};
  },
} as unknown as Transporter;
const GONE = randomUUID();

before(async () => {
  const image = await GenericContainer.fromDockerfile(
    new URL('../../../../../deploy/postgres', import.meta.url).pathname,
  ).build('raadi-postgres-test', { deleteOnExit: false });
  container = await image
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'notifications' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  pool = new pg.Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: 'postgres',
    password: 'test',
    database: 'notifications',
  });
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    await pool.query(sql.split('-- migrate:down')[0]!.replace('-- migrate:up', ''));
  }
  repo = new NotificationsRepository(pool);
  const cfg = {
    env: {
      PUBLIC_BASE_URL: 'http://raadi.localhost',
      SMTP_FROM: 'Raadi <no-reply@raadi.localhost>',
      EMAIL_THROTTLE_MINUTES: 30,
      EMAIL_MAX_ATTEMPTS: 2,
    },
  } as unknown as AppConfig;
  service = new NotificationsService(repo, directory, mailer, cfg);
});

after(async () => {
  await pool?.end();
  await container?.stop();
});

const received = (value: unknown): ReceivedEvent => ({
  topic: 't',
  partition: 0,
  offset: 0n,
  key: undefined,
  headers: {},
  value,
});
const messageSent = (recipientId: string, conversationId: string, body = 'secret text') => ({
  event: buildEvent('no.raadi.messaging.conversation.message_sent.v1', {
    source: 'urn:raadi:messaging',
    subject: conversationId,
    data: {
      conversationId,
      messageId: randomUUID(),
      listingId: randomUUID(),
      senderId: randomUUID(),
      recipientId,
      sentAt: new Date().toISOString(),
    },
  }),
  body,
});
const drain = async () => {
  while ((await service.sendDue()) > 0) {
    /* drain */
  }
};

describe('notifications pipeline', () => {
  it('e-mails the recipient once per conversation per window, and once per event', async () => {
    const user = randomUUID();
    const conversation = randomUUID();
    const first = messageSent(user, conversation);
    await service.onEvent(received(first.event));
    await service.onEvent(received(first.event)); // redelivery
    await service.onEvent(received(messageSent(user, conversation).event)); // throttled
    await drain();
    const mine = sent.filter((m) => m.to === `${user}@example.test`);
    assert.equal(mine.length, 1);
    assert.match(mine[0]!.text, new RegExp(`/nb/messages/${conversation}`));
    assert.ok(!mine[0]!.text.includes('secret text'));
  });

  it('respects the opt-out for message e-mails', async () => {
    const user = randomUUID();
    await repo.savePreferences(user, { emailMessages: false });
    await service.onEvent(received(messageSent(user, randomUUID()).event));
    await drain();
    assert.equal(sent.filter((m) => m.to === `${user}@example.test`).length, 0);
  });

  it('notifies and e-mails owners when a moderator removes their listing, not when they delete it', async () => {
    const owner = randomUUID();
    const deleted = (reason: 'owner' | 'moderation') =>
      buildEvent('no.raadi.listings.listing.deleted.v1', {
        source: 'urn:raadi:listings',
        subject: randomUUID(),
        data: {
          listingId: randomUUID(),
          version: 2,
          imageIds: [],
          ownerId: owner,
          title: 'Sykkel',
          reason,
        },
      });
    await service.onEvent(received(deleted('owner')));
    await service.onEvent(received(deleted('moderation')));
    await drain();
    const list = await repo.list(owner, 10);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.kind, 'listing_removed');
    assert.equal(await repo.unread(owner), 1);
    const mail = sent.filter((m) => m.to === `${owner}@example.test`);
    assert.equal(mail.length, 1);
    assert.match(mail[0]!.text, /Sykkel/);
    await repo.markAllRead(owner);
    assert.equal(await repo.unread(owner), 0);
  });

  it('retries failed sends with backoff, skips users without an address, then gives up', async () => {
    const user = randomUUID();
    failSends = 1;
    await service.onEvent(received(messageSent(user, randomUUID()).event));
    await drain();
    let row = (await pool.query('SELECT * FROM emails WHERE user_id = $1', [user])).rows[0];
    assert.equal(row.status, 'pending');
    assert.equal(row.attempts, 1);
    await pool.query('UPDATE emails SET next_attempt_at = now() WHERE id = $1', [row.id]);
    await drain();
    row = (await pool.query('SELECT * FROM emails WHERE id = $1', [row.id])).rows[0];
    assert.equal(row.status, 'sent');

    await service.onEvent(received(messageSent(GONE, randomUUID()).event));
    await drain();
    const gone = (await pool.query('SELECT status FROM emails WHERE user_id = $1', [GONE])).rows[0];
    assert.equal(gone.status, 'skipped');

    const unlucky = randomUUID();
    failSends = 10;
    await service.onEvent(received(messageSent(unlucky, randomUUID()).event));
    for (let i = 0; i < 2; i++) {
      await pool.query('UPDATE emails SET next_attempt_at = now() WHERE user_id = $1', [unlucky]);
      await drain();
    }
    failSends = 0;
    const failed = (await pool.query('SELECT status FROM emails WHERE user_id = $1', [unlucky]))
      .rows[0];
    assert.equal(failed.status, 'failed');
  });
});
