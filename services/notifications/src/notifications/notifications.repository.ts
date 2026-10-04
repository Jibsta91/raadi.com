import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@raadi/service-kit';
import type pg from 'pg';
import { PG_POOL } from '../tokens.js';
import type {
  Device,
  EmailKind,
  EmailRow,
  NotificationKind,
  NotificationRow,
  Preferences,
  PushKind,
  PushRow,
} from './model.js';

/** The two outgoing queues share their shape and their claim/lease logic. */
export type Queue = 'emails' | 'pushes';
type QueueRow<Q extends Queue> = Q extends 'emails' ? EmailRow : PushRow;

export interface QueuePush {
  userId: string;
  kind: PushKind;
  refId: string;
  params?: Record<string, string>;
  /** Skip if a push of this kind about this ref was queued within the window. */
  throttleSeconds?: number;
}

export interface QueueEmail {
  userId: string;
  kind: EmailKind;
  refId: string;
  params?: Record<string, string>;
  /** Skip if an e-mail of this kind about this ref was queued within the window. */
  throttleMinutes?: number;
}

/**
 * Notifications, the e-mail queue and preferences. Event handling runs in
 * one transaction with the inbox row, so a redelivered event changes nothing.
 */
@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * Runs `fn` for an event exactly once. Returns false (and runs nothing) if
   * the event was already processed.
   */
  async once(eventId: string, fn: (tx: Tx) => Promise<void>): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const fresh = await client.query(
        'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [eventId],
      );
      if (!fresh.rowCount) return false;
      await fn(new Tx(client));
      return true;
    });
  }

  async list(userId: string, limit: number): Promise<NotificationRow[]> {
    const { rows } = await this.pool.query<NotificationRow>(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return rows;
  }

  async unread(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return Number(rows[0]!.n);
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return rowCount === 1;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
  }

  async preferences(userId: string, db: pg.Pool | pg.PoolClient = this.pool): Promise<Preferences> {
    const { rows } = await db.query<{ email_messages: boolean; push_messages: boolean }>(
      'SELECT email_messages, push_messages FROM preferences WHERE user_id = $1',
      [userId],
    );
    return {
      emailMessages: rows[0]?.email_messages ?? true,
      pushMessages: rows[0]?.push_messages ?? true,
    };
  }

  /** Saves the preferences; a missing pushMessages keeps the stored value (older clients). */
  async savePreferences(
    userId: string,
    prefs: { emailMessages: boolean; pushMessages?: boolean },
  ): Promise<Preferences> {
    const { rows } = await this.pool.query<{ email_messages: boolean; push_messages: boolean }>(
      `INSERT INTO preferences (user_id, email_messages, push_messages)
       VALUES ($1, $2, COALESCE($3, true))
       ON CONFLICT (user_id) DO UPDATE
         SET email_messages = EXCLUDED.email_messages,
             push_messages = COALESCE($3, preferences.push_messages),
             updated_at = now()
       RETURNING email_messages, push_messages`,
      [userId, prefs.emailMessages, prefs.pushMessages ?? null],
    );
    return { emailMessages: rows[0]!.email_messages, pushMessages: rows[0]!.push_messages };
  }

  // ------------------------------------------------------------- devices

  /** Registers (or moves) an app installation's push token to this user. */
  async registerDevice(userId: string, device: Device): Promise<void> {
    await this.pool.query(
      `INSERT INTO devices (token, user_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [device.token, userId, device.platform],
    );
  }

  /** Removes one of the user's own devices (sign-out). */
  async removeDevice(userId: string, token: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM devices WHERE token = $1 AND user_id = $2',
      [token, userId],
    );
    return rowCount === 1;
  }

  async deviceTokens(userId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ token: string }>(
      'SELECT token FROM devices WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 20',
      [userId],
    );
    return rows.map((r) => r.token);
  }

  /** Forgets tokens the push service reported as uninstalled. */
  async forgetTokens(tokens: string[]): Promise<void> {
    if (tokens.length) await this.pool.query('DELETE FROM devices WHERE token = ANY($1)', [tokens]);
  }

  // -------------------------------------------------------------- queues

  /**
   * Claims up to `limit` due rows of a queue for this worker: the lease (next
   * attempt pushed into the future) keeps other instances off them while sending.
   */
  async claimDue<Q extends Queue>(
    queue: Q,
    limit: number,
    leaseMs: number,
  ): Promise<QueueRow<Q>[]> {
    const { rows } = await this.pool.query<QueueRow<Q>>(
      `UPDATE ${queue} SET attempts = attempts + 1,
              next_attempt_at = now() + make_interval(secs => $2::double precision / 1000)
        WHERE id IN (SELECT id FROM ${queue} WHERE status = 'pending' AND next_attempt_at <= now()
                      ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [limit, leaseMs],
    );
    return rows;
  }

  async finish(
    queue: Queue,
    id: string,
    status: 'sent' | 'skipped' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ${queue} SET status = $2, last_error = $3,
              sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
        WHERE id = $1`,
      [id, status, error?.slice(0, 500) ?? null],
    );
  }

  async retryLater(queue: Queue, id: string, delayMs: number, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${queue} SET next_attempt_at = now() + make_interval(secs => $2::double precision / 1000),
              last_error = $3
        WHERE id = $1`,
      [id, delayMs, error.slice(0, 500)],
    );
  }

  /** Queue depth for metrics and alerts. */
  async pendingCount(queue: Queue): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${queue} WHERE status = 'pending'`,
    );
    return Number(rows[0]!.n);
  }
}

/** Writes inside an event's transaction. */
export class Tx {
  constructor(readonly client: pg.PoolClient) {}

  async notify(
    userId: string,
    kind: NotificationKind,
    refId: string,
    params: Record<string, string>,
  ) {
    await this.client.query(
      `INSERT INTO notifications (id, user_id, kind, ref_id, params) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), userId, kind, refId, params],
    );
  }

  /**
   * Adds new saved-search matches to the user's unread notice for that search
   * (one growing notice instead of one per check), or creates the notice.
   */
  async notifyMatches(userId: string, savedSearchId: string, count: number): Promise<void> {
    const { rowCount } = await this.client.query(
      `UPDATE notifications
          SET params = jsonb_set(params, '{count}', to_jsonb(((params->>'count')::int + $3)::text)),
              created_at = now()
        WHERE user_id = $1 AND kind = 'saved_search_match' AND ref_id = $2 AND read_at IS NULL`,
      [userId, savedSearchId, count],
    );
    if (!rowCount)
      await this.notify(userId, 'saved_search_match', savedSearchId, { count: String(count) });
  }

  /**
   * Queues a push unless the user has no devices (nothing to send to) or one
   * was queued for the same thing within the throttle window.
   */
  async queuePush(p: QueuePush): Promise<'queued' | 'throttled' | 'no_device'> {
    const devices = await this.client.query('SELECT 1 FROM devices WHERE user_id = $1 LIMIT 1', [
      p.userId,
    ]);
    if (!devices.rowCount) return 'no_device';
    if (p.throttleSeconds) {
      const { rowCount } = await this.client.query(
        `SELECT 1 FROM pushes WHERE user_id = $1 AND kind = $2 AND ref_id = $3
            AND created_at > now() - make_interval(secs => $4) LIMIT 1`,
        [p.userId, p.kind, p.refId, p.throttleSeconds],
      );
      if (rowCount) return 'throttled';
    }
    await this.client.query(
      `INSERT INTO pushes (id, user_id, kind, ref_id, params) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), p.userId, p.kind, p.refId, p.params ?? {}],
    );
    return 'queued';
  }

  /** Queues an e-mail unless one was queued for the same thing within the throttle window. */
  async queueEmail(e: QueueEmail): Promise<boolean> {
    if (e.throttleMinutes) {
      const { rowCount } = await this.client.query(
        `SELECT 1 FROM emails WHERE user_id = $1 AND kind = $2 AND ref_id = $3
            AND created_at > now() - make_interval(mins => $4) LIMIT 1`,
        [e.userId, e.kind, e.refId, e.throttleMinutes],
      );
      if (rowCount) return false;
    }
    await this.client.query(
      `INSERT INTO emails (id, user_id, kind, ref_id, params) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), e.userId, e.kind, e.refId, e.params ?? {}],
    );
    return true;
  }
}
