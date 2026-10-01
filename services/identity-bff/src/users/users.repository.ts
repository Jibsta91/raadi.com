import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../tokens.js';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  locale: 'nb' | 'en' | 'so';
  createdAt: string;
  lastLoginAt: string | null;
}

interface Row {
  id: string;
  email: string;
  display_name: string | null;
  locale: 'nb' | 'en' | 'so';
  created_at: Date;
  last_login_at: Date | null;
}

const toProfile = (r: Row): UserProfile => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  locale: r.locale,
  createdAt: r.created_at.toISOString(),
  lastLoginAt: r.last_login_at?.toISOString() ?? null,
});

/** CloudEvents 1.0 envelope written to the outbox. Payloads carry ids, never PII. */
function cloudEvent(type: string, subject: string, data: Record<string, unknown>) {
  return {
    specversion: '1.0',
    id: randomUUID(),
    source: 'urn:raadi:identity-bff',
    type: `no.raadi.identity.${type}.v1`,
    subject,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data,
  };
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * Upserts the profile on every login. A first login also emits
   * `user.registered` through the outbox in the same transaction.
   */
  async recordLogin(input: {
    id: string;
    email: string;
    displayName?: string;
    locale: string;
  }): Promise<{
    profile: UserProfile;
    registered: boolean;
  }> {
    return this.tx(async (client) => {
      const { rows } = await client.query<Row & { inserted: boolean }>(
        `INSERT INTO user_profiles (id, email, display_name, locale, last_login_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (id) DO UPDATE
           SET email = EXCLUDED.email,
               display_name = COALESCE(user_profiles.display_name, EXCLUDED.display_name),
               last_login_at = now(),
               updated_at = now()
         RETURNING *, (xmax = 0) AS inserted`,
        [input.id, input.email, input.displayName ?? null, input.locale],
      );
      const row = rows[0]!;
      if (row.inserted) {
        await this.outbox(client, 'user', row.id, 'user.registered', {
          userId: row.id,
          locale: row.locale,
        });
      }
      return { profile: toProfile(row), registered: row.inserted };
    });
  }

  async findById(id: string): Promise<UserProfile | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM user_profiles WHERE id = $1', [id]);
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async updatePreferences(
    id: string,
    patch: { locale?: string; displayName?: string },
  ): Promise<UserProfile | null> {
    return this.tx(async (client) => {
      const { rows } = await client.query<Row>(
        `UPDATE user_profiles
            SET locale = COALESCE($2, locale),
                display_name = COALESCE($3, display_name),
                updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id, patch.locale ?? null, patch.displayName ?? null],
      );
      if (!rows[0]) return null;
      await this.outbox(client, 'user', id, 'user.preferences_changed', {
        userId: id,
        changed: Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined),
      });
      return toProfile(rows[0]);
    });
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private async outbox(
    client: pg.PoolClient,
    aggregate: string,
    aggregateId: string,
    type: string,
    data: object,
  ) {
    const event = cloudEvent(type, aggregateId, data as Record<string, unknown>);
    await client.query(
      `INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.id, aggregate, aggregateId, event.type, event],
    );
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
