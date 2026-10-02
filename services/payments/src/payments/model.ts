import { z } from 'zod';

/** What can be bought. Prices in øre (NOK × 100), VAT included. */
export const PRODUCTS = {
  promote_7d: { days: 7, amountOre: 4900 },
  promote_30d: { days: 30, amountOre: 14900 },
} as const;
export type Product = keyof typeof PRODUCTS;

export type OrderStatus =
  'created' | 'authorized' | 'captured' | 'refunded' | 'cancelled' | 'expired' | 'failed';

/** What a provider tells us happened to a payment (webhook or status lookup). */
export type ProviderOutcome =
  'authorized' | 'captured' | 'refunded' | 'aborted' | 'expired' | 'cancelled' | 'failed';

const TERMINAL: ReadonlySet<OrderStatus> = new Set(['refunded', 'cancelled', 'expired', 'failed']);

/**
 * The order state machine. Returns the next status, or null when the outcome
 * does not apply (duplicates, out-of-order or late events are ignored, never
 * moving an order backwards).
 */
export function transition(current: OrderStatus, outcome: ProviderOutcome): OrderStatus | null {
  if (TERMINAL.has(current)) return null;
  switch (current) {
    case 'created':
      switch (outcome) {
        case 'authorized':
          return 'authorized';
        case 'captured':
          return 'captured'; // providers that capture automatically (Stripe Checkout)
        case 'aborted':
        case 'cancelled':
          return 'cancelled';
        case 'expired':
          return 'expired';
        case 'failed':
          return 'failed';
        default:
          return null;
      }
    case 'authorized':
      switch (outcome) {
        case 'captured':
          return 'captured';
        case 'cancelled':
        case 'aborted':
        case 'expired':
          return 'cancelled';
        case 'failed':
          return 'failed';
        default:
          return null;
      }
    case 'captured':
      return outcome === 'refunded' ? 'refunded' : null;
    default:
      return null;
  }
}

/**
 * When a newly bought promotion runs: from the end of the listing's current
 * promotion if it is still running (purchases stack), otherwise from now.
 */
export function promotionWindow(
  currentEnd: Date | null,
  now: Date,
  days: number,
): { startsAt: Date; endsAt: Date } {
  const startsAt = currentEnd && currentEnd > now ? currentEnd : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + days * 86_400_000) };
}

export interface OrderRow {
  id: string;
  user_id: string;
  listing_id: string;
  product: Product;
  amount_ore: number;
  currency: 'NOK';
  provider: 'vipps' | 'stripe';
  provider_ref: string | null;
  redirect_url: string | null;
  status: OrderStatus;
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  listingId: string;
  product: Product;
  amountOre: number;
  currency: 'NOK';
  provider: 'vipps' | 'stripe';
  status: OrderStatus;
  /** Where to send the payer while the order waits for approval. */
  redirectUrl: string | null;
  promotedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toOrder(row: OrderRow, promotedUntil: Date | null = null): Order {
  return {
    id: row.id,
    listingId: row.listing_id,
    product: row.product,
    amountOre: row.amount_ore,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    redirectUrl: row.status === 'created' ? row.redirect_url : null,
    promotedUntil: promotedUntil?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const createOrderSchema = z
  .object({
    listingId: z.uuid(),
    product: z.enum(Object.keys(PRODUCTS) as [Product, ...Product[]]),
    locale: z.enum(['nb', 'en', 'so']).default('nb'),
  })
  .strict();
export type CreateOrder = z.infer<typeof createOrderSchema>;

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, 'Idempotency-Key must be 8–128 URL-safe characters');

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
