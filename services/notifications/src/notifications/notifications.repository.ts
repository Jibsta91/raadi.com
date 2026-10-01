import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { withTransaction } from '@raadi/service-kit';
import type pg from 'pg';
import { PG_POOL } from '../tokens.js';
import type {
  EmailKind,
  EmailRow,
  NotificationKind,
  NotificationRow,
  Preferences,
} from './model.js';

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
    const { rows } = await db.query<{ email_messages: boolean }>(
      'SELECT email_messages FROM preferences WHERE user_id = $1',
      [userId],
    );
    return { emailMessages: rows[0]?.email_messages ?? true };
  }

  async savePreferences(userId: string, prefs: Preferences): Promise<Preferences> {
    await this.pool.query(
      `INSERT INTO preferences (user_id, email_messages) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET email_messages = EXCLUDED.email_messages, updated_at = now()`,
      [userId, prefs.emailMessages],
    );
    return prefs;
  }

  /**
   * Claims up to `limit` due e-mails for this worker: the lease (next attempt
   * pushed into the future) keeps other instances off them while sending.
   */
  async claimDue(limit: number, leaseMs: number): Promise<EmailRow[]> {
    const { rows } = await this.pool.query<EmailRow>(
      `UPDATE emails SET attempts = attempts + 1,
              next_attempt_at = now() + make_interval(secs => $2::double precision / 1000)
        WHERE id IN (SELECT id FROM emails WHERE status = 'pending' AND next_attempt_at <= now()
                      ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [limit, leaseMs],
    );
    return rows;
  }

  async finish(id: string, status: 'sent' | 'skipped' | 'failed', error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE emails SET status = $2, last_error = $3,
              sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
        WHERE id = $1`,
      [id, status, error ?? null],
    );
  }

  async retryLater(id: string, delayMs: number, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE emails SET next_attempt_at = now() + make_interval(secs => $2::double precision / 1000),
              last_error = $3
        WHERE id = $1`,
      [id, delayMs, error.slice(0, 500)],
    );
  }

  /** Queue depth for metrics and alerts. */
  async pendingCount(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      "SELECT count(*) AS n FROM emails WHERE status = 'pending'",
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
