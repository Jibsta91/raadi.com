import { createHmac, timingSafeEqual } from 'node:crypto';
import { circuitBreaker } from '@raadi/service-kit';
import { z } from 'zod';
import {
  type CreatePaymentInput,
  header,
  type IncomingWebhook,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderStatus,
  WebhookRejected,
} from './provider.js';

export interface StripeOptions {
  baseUrl?: string;
  secretKey: string;
  webhookSecret: string;
  toleranceMs?: number;
}

const sessionSchema = z.object({
  id: z.string(),
  status: z.enum(['open', 'complete', 'expired']).nullable(),
  payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
  client_reference_id: z.string().nullable(),
  amount_total: z.number().int().nullable(),
  payment_intent: z
    .union([
      z.string(),
      z.object({
        id: z.string(),
        status: z.string(),
        amount_received: z.number().int(),
        latest_charge: z
          .union([z.string(), z.object({ amount_refunded: z.number().int() })])
          .nullable()
          .optional(),
      }),
    ])
    .nullable(),
});
type Session = z.infer<typeof sessionSchema>;

const eventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

export class StripeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Form encoding with Stripe's bracket notation for nested objects. */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === 'object') return formEncode(v as Record<string, unknown>, key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });
}

/**
 * Stripe Checkout (hosted page, automatic capture). Card data never reaches
 * Raadi. Built against Stripe's API shapes; contract-tested with recorded
 * fixtures (ADR-0020).
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  readonly autoCapture = true;
  private readonly call;

  constructor(private readonly o: StripeOptions) {
    this.call = circuitBreaker(
      (method: string, path: string, form?: Record<string, unknown>, key?: string) =>
        this.request(method, path, form, key),
      {
        name: 'stripe',
        timeoutMs: 10_000,
        errorFilter: (e) => e instanceof StripeError && e.status < 500,
      },
    );
  }

  async create(i: CreatePaymentInput) {
    const s = sessionSchema.extend({ url: z.string() }).parse(
      await this.call.fire(
        'POST',
        '/v1/checkout/sessions',
        {
          mode: 'payment',
          success_url: i.returnUrl,
          cancel_url: i.returnUrl,
          client_reference_id: i.reference,
          line_items: {
            0: {
              quantity: 1,
              price_data: {
                currency: 'nok',
                unit_amount: i.amountOre,
                product_data: { name: i.description },
              },
            },
          },
          payment_intent_data: { metadata: { order_id: i.reference } },
          metadata: { order_id: i.reference },
        },
        i.idempotencyKey,
      ),
    );
    return { providerRef: s.id, redirectUrl: s.url };
  }

  async status(ref: string): Promise<ProviderStatus> {
    const s = sessionSchema.parse(
      await this.call.fire(
        'GET',
        `/v1/checkout/sessions/${encodeURIComponent(ref)}?expand[]=payment_intent.latest_charge`,
      ),
    );
    return statusOf(s);
  }

  async capture(): Promise<void> {
    /* Checkout captures automatically */
  }

  async refund(ref: string, amountOre: number, key: string) {
    const s = sessionSchema.parse(
      await this.call.fire('GET', `/v1/checkout/sessions/${encodeURIComponent(ref)}`),
    );
    const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
    if (!pi) throw new StripeError(409, 'session has no payment to refund');
    await this.call.fire('POST', '/v1/refunds', { payment_intent: pi, amount: amountOre }, key);
  }

  async cancel(ref: string, key: string) {
    await this.call.fire(
      'POST',
      `/v1/checkout/sessions/${encodeURIComponent(ref)}/expire`,
      {},
      key,
    );
  }

  /** Stripe-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "t.payload")>. */
  verifyWebhook(req: IncomingWebhook): ProviderEvent | null {
    const sig = header(req.headers, 'stripe-signature');
    const parts = Object.fromEntries(
      sig.split(',').map((p) => p.split('=', 2) as [string, string]),
    ) as Record<string, string>;
    const t = Number(parts.t);
    const tolerance = this.o.toleranceMs ?? 5 * 60_000;
    if (!Number.isFinite(t) || Math.abs(Date.now() - t * 1000) > tolerance) {
      throw new WebhookRejected('stale or missing timestamp');
    }
    const expected = createHmac('sha256', this.o.webhookSecret)
      .update(`${parts.t}.`)
      .update(req.rawBody)
      .digest('hex');
    const v1 = sig
      .split(',')
      .filter((p) => p.startsWith('v1='))
      .map((p) => p.slice(3));
    if (!v1.some((s) => same(s, expected))) throw new WebhookRejected('bad signature');
    let event;
    try {
      event = eventSchema.parse(JSON.parse(req.rawBody.toString('utf8')));
    } catch {
      throw new WebhookRejected('unparseable body');
    }
    const o = event.data.object as { client_reference_id?: string; payment_status?: string };
    const reference = o.client_reference_id;
    if (!reference) return null;
    const outcome = ((): ProviderEvent['outcome'] | null => {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          return o.payment_status === 'paid' ? 'captured' : null;
        case 'checkout.session.expired':
          return 'expired';
        case 'checkout.session.async_payment_failed':
          return 'failed';
        default:
          return null;
      }
    })();
    return outcome ? { eventId: event.id, reference, outcome } : null;
  }

  private async request(
    method: string,
    path: string,
    form?: Record<string, unknown>,
    key?: string,
  ) {
    const res = await fetch(`${this.o.baseUrl ?? 'https://api.stripe.com'}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.o.secretKey}`,
        // Pinned API version: Stripe changes response shapes between versions.
        'Stripe-Version': '2025-03-31.basil',
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: form ? formEncode(form).join('&') : undefined,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok)
      throw new StripeError(
        res.status,
        `Stripe ${method} ${path.split('?')[0]} returned ${res.status}`,
      );
    return res.json() as Promise<unknown>;
  }
}

/** Maps a Checkout Session (with its payment intent expanded) to Raadi's view. */
export function statusOf(s: Session): ProviderStatus {
  const pi = typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const received = pi?.amount_received ?? (s.payment_status === 'paid' ? (s.amount_total ?? 0) : 0);
  if (charge && charge.amount_refunded > 0)
    return { outcome: 'refunded', authorizedOre: received, capturedOre: received };
  if (s.payment_status === 'paid')
    return { outcome: 'captured', authorizedOre: received, capturedOre: received };
  if (s.status === 'expired') return { outcome: 'expired', authorizedOre: 0, capturedOre: 0 };
  if (pi?.status === 'canceled') return { outcome: 'cancelled', authorizedOre: 0, capturedOre: 0 };
  return { outcome: 'pending', authorizedOre: 0, capturedOre: 0 };
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
