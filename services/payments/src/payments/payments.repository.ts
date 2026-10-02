import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { buildEvent } from '@raadi/events';
import { appendToOutbox, withTransaction } from '@raadi/service-kit';
import type pg from 'pg';
import { PG_POOL } from '../tokens.js';
import {
  type OrderRow,
  type OrderStatus,
  PRODUCTS,
  type Product,
  promotionWindow,
} from './model.js';

export type Source = 'api' | 'webhook' | 'reconcile' | 'admin';

export interface NewOrder {
  userId: string;
  listingId: string;
  product: Product;
  provider: 'vipps' | 'stripe';
  idempotencyKey: string;
  requestHash: string;
}

/** Orders, their state changes, promotions and outbox events. */
@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /** Inserts a new order, or returns the one created earlier with the same key. */
  async insertOrder(o: NewOrder): Promise<{ row: OrderRow; created: boolean }> {
    const { rows } = await this.pool.query<OrderRow>(
      `INSERT INTO orders (id, user_id, listing_id, product, amount_ore, provider, idempotency_key, request_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        randomUUID(),
        o.userId,
        o.listingId,
        o.product,
        PRODUCTS[o.product].amountOre,
        o.provider,
        o.idempotencyKey,
        o.requestHash,
      ],
    );
    if (rows[0]) return { row: rows[0], created: true };
    return { row: (await this.byKey(o.userId, o.idempotencyKey))!, created: false };
  }

  async byKey(userId: string, key: string): Promise<OrderRow | null> {
    const { rows } = await this.pool.query<OrderRow>(
      'SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2',
      [userId, key],
    );
    return rows[0] ?? null;
  }

  async get(id: string): Promise<OrderRow | null> {
    const { rows } = await this.pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async listForUser(userId: string, limit: number): Promise<OrderRow[]> {
    const { rows } = await this.pool.query<OrderRow>(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return rows;
  }

  async setProvider(id: string, providerRef: string, redirectUrl: string): Promise<OrderRow> {
    const { rows } = await this.pool.query<OrderRow>(
      `UPDATE orders SET provider_ref = $2, redirect_url = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, providerRef, redirectUrl],
    );
    return rows[0]!;
  }

  /** Open orders nobody has heard about for a while (lost webhooks, abandoned payments). */
  async stale(afterSeconds: number, limit = 20): Promise<OrderRow[]> {
    const { rows } = await this.pool.query<OrderRow>(
      `SELECT * FROM orders WHERE status IN ('created', 'authorized') AND provider_ref IS NOT NULL
         AND updated_at < now() - make_interval(secs => $1)
       ORDER BY updated_at LIMIT $2`,
      [afterSeconds, limit],
    );
    return rows;
  }

  /** Orders still open after `seconds` (for the PaymentsStuckOpen alert). */
  async countStuck(seconds: number): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM orders WHERE status IN ('created', 'authorized')
         AND created_at < now() - make_interval(secs => $1)`,
      [seconds],
    );
    return Number(rows[0]!.n);
  }

  /**
   * Runs `fn` with the order row locked, so webhooks, reconciliation and API
   * calls for one order are applied one at a time.
   */
  async locked<T>(
    id: string,
    fn: (tx: Tx, row: OrderRow) => Promise<T>,
    inbox?: { provider: string; eventId: string },
  ): Promise<T | null> {
    return withTransaction(this.pool, async (client) => {
      if (inbox) {
        const fresh = await client.query(
          'INSERT INTO webhook_inbox (provider, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [inbox.provider, inbox.eventId],
        );
        if (!fresh.rowCount) return null; // already processed
      }
      const { rows } = await client.query<OrderRow>(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows[0]) return null;
      return fn(new Tx(client), rows[0]);
    });
  }

  async promotedUntil(listingId: string): Promise<Date | null> {
    return promotedUntil(this.pool, listingId);
  }
}

/** The end of the listing's running promotions (null if none). */
async function promotedUntil(db: pg.Pool | pg.PoolClient, listingId: string): Promise<Date | null> {
  const { rows } = await db.query<{ until: Date | null }>(
    'SELECT max(ends_at) AS until FROM promotions WHERE listing_id = $1 AND revoked_at IS NULL',
    [listingId],
  );
  return rows[0]?.until ?? null;
}

/** Writes inside one order transaction. */
export class Tx {
  constructor(readonly client: pg.PoolClient) {}

  async setStatus(row: OrderRow, to: OrderStatus, source: Source): Promise<OrderRow> {
    const { rows } = await this.client.query<OrderRow>(
      'UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [row.id, to],
    );
    await this.client.query(
      'INSERT INTO order_events (order_id, from_status, to_status, source) VALUES ($1, $2, $3, $4)',
      [row.id, row.status, to, source],
    );
    return rows[0]!;
  }

  async touch(id: string): Promise<void> {
    await this.client.query('UPDATE orders SET updated_at = now() WHERE id = $1', [id]);
  }

  promotedUntil(listingId: string): Promise<Date | null> {
    return promotedUntil(this.client, listingId);
  }

  /**
   * Activates what a captured order bought and publishes payment.captured and
   * promotion.changed in the same transaction.
   */
  async activate(row: OrderRow, now = new Date()): Promise<Date> {
    // Serialise promotions per listing (two orders for one listing at once).
    await this.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [row.listing_id]);
    const current = await this.promotedUntil(row.listing_id);
    const { startsAt, endsAt } = promotionWindow(current, now, PRODUCTS[row.product].days);
    await this.client.query(
      'INSERT INTO promotions (order_id, listing_id, starts_at, ends_at) VALUES ($1, $2, $3, $4)',
      [row.id, row.listing_id, startsAt, endsAt],
    );
    await appendToOutbox(
      this.client,
      'payment',
      row.id,
      buildEvent('no.raadi.payments.payment.captured.v1', {
        source: 'urn:raadi:payments',
        subject: row.id,
        data: {
          orderId: row.id,
          userId: row.user_id,
          listingId: row.listing_id,
          product: row.product,
          amountOre: row.amount_ore,
          currency: 'NOK',
          provider: row.provider,
          capturedAt: now.toISOString(),
        },
      }),
    );
    await this.promotionChanged(row, endsAt, 'purchased');
    return endsAt;
  }

  /** Ends what a refunded order bought and publishes the listing's new promotion end. */
  async revoke(row: OrderRow): Promise<Date | null> {
    await this.client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [row.listing_id]);
    await this.client.query('UPDATE promotions SET revoked_at = now() WHERE order_id = $1', [
      row.id,
    ]);
    const until = await this.promotedUntil(row.listing_id);
    await this.promotionChanged(row, until, 'refunded');
    return until;
  }

  private async promotionChanged(
    row: OrderRow,
    until: Date | null,
    reason: 'purchased' | 'refunded',
  ) {
    // Keyed by listing, so a listing's promotion events stay in order.
    await appendToOutbox(
      this.client,
      'promotion',
      row.listing_id,
      buildEvent('no.raadi.payments.promotion.changed.v1', {
        source: 'urn:raadi:payments',
        subject: row.listing_id,
        data: {
          listingId: row.listing_id,
          orderId: row.id,
          promotedUntil: until?.toISOString() ?? null,
          reason,
        },
      }),
    );
  }
}
