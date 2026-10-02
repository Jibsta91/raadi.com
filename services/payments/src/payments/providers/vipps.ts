import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { circuitBreaker } from '@raadi/service-kit';
import { z } from 'zod';
import type { ProviderOutcome } from '../model.js';
import {
  type CreatePaymentInput,
  header,
  type IncomingWebhook,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderStatus,
  WebhookRejected,
} from './provider.js';

export interface VippsOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  merchantSerialNumber: string;
  webhookSecret: string;
  /** Webhooks older or newer than this are refused (replay protection). */
  maxClockSkewMs?: number;
}

const amount = z.object({ currency: z.literal('NOK'), value: z.number().int() });
const statusSchema = z.object({
  state: z.enum(['CREATED', 'AUTHORIZED', 'ABORTED', 'EXPIRED', 'TERMINATED']),
  aggregate: z.object({
    authorizedAmount: amount,
    capturedAmount: amount,
    refundedAmount: amount,
    cancelledAmount: amount,
  }),
});
const webhookSchema = z.object({
  reference: z.string(),
  pspReference: z.string().optional(),
  name: z.string(),
  amount: amount.optional(),
});

const OUTCOMES: Record<string, ProviderOutcome | undefined> = {
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  REFUNDED: 'refunded',
  ABORTED: 'aborted',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TERMINATED: 'cancelled',
};

export class VippsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Vipps MobilePay ePayment API (WEB_REDIRECT flow). In development it talks to
 * payments-mock, which implements the same API; in production to
 * api.vipps.no / apitest.vipps.no.
 */
export class VippsProvider implements PaymentProvider {
  readonly name = 'vipps' as const;
  readonly autoCapture = false;
  private token?: { value: string; expiresAt: number };
  private readonly call;

  constructor(private readonly o: VippsOptions) {
    this.call = circuitBreaker(
      (method: string, path: string, body?: unknown, idempotencyKey?: string) =>
        this.request(method, path, body, idempotencyKey),
      // 4xx are answers, not outages: they must not open the circuit.
      {
        name: 'vipps',
        timeoutMs: 10_000,
        errorFilter: (e) => e instanceof VippsError && e.status < 500,
      },
    );
  }

  async create(i: CreatePaymentInput) {
    const res = (await this.call.fire(
      'POST',
      '/epayment/v1/payments',
      {
        amount: { currency: 'NOK', value: i.amountOre },
        paymentMethod: { type: 'WALLET' },
        reference: i.reference,
        returnUrl: i.returnUrl,
        userFlow: 'WEB_REDIRECT',
        paymentDescription: i.description,
      },
      i.idempotencyKey,
    )) as { redirectUrl: string; reference: string };
    return { providerRef: res.reference, redirectUrl: res.redirectUrl };
  }

  async status(ref: string): Promise<ProviderStatus> {
    const s = statusSchema.parse(
      await this.call.fire('GET', `/epayment/v1/payments/${encodeURIComponent(ref)}`),
    );
    const a = s.aggregate;
    const outcome = ((): ProviderStatus['outcome'] => {
      switch (s.state) {
        case 'CREATED':
          return 'pending';
        case 'ABORTED':
          return 'aborted';
        case 'EXPIRED':
          return 'expired';
        case 'TERMINATED':
          return 'cancelled';
        case 'AUTHORIZED':
          if (a.refundedAmount.value > 0) return 'refunded';
          if (a.capturedAmount.value > 0) return 'captured';
          if (a.cancelledAmount.value > 0) return 'cancelled';
          return 'authorized';
      }
    })();
    return {
      outcome,
      authorizedOre: a.authorizedAmount.value,
      capturedOre: a.capturedAmount.value,
    };
  }

  async capture(ref: string, amountOre: number, key: string) {
    await this.modify(ref, 'capture', key, amountOre);
  }

  async refund(ref: string, amountOre: number, key: string) {
    await this.modify(ref, 'refund', key, amountOre);
  }

  async cancel(ref: string, key: string) {
    await this.modify(ref, 'cancel', key);
  }

  private async modify(ref: string, op: string, key: string, amountOre?: number) {
    await this.call.fire(
      'POST',
      `/epayment/v1/payments/${encodeURIComponent(ref)}/${op}`,
      amountOre === undefined ? {} : { modificationAmount: { currency: 'NOK', value: amountOre } },
      key,
    );
  }

  /**
   * Vipps webhook authentication: the body's SHA-256 must match
   * x-ms-content-sha256, and Authorization carries an HMAC-SHA256 over
   * method, path, x-ms-date, host and that hash.
   */
  verifyWebhook(req: IncomingWebhook): ProviderEvent | null {
    const date = header(req.headers, 'x-ms-date');
    const claimedHash = header(req.headers, 'x-ms-content-sha256');
    const auth = header(req.headers, 'authorization');
    const hash = createHash('sha256').update(req.rawBody).digest('base64');
    if (!same(hash, claimedHash)) throw new WebhookRejected('body hash mismatch');
    const sent = Date.parse(date);
    const skew = this.o.maxClockSkewMs ?? 5 * 60_000;
    if (Number.isNaN(sent) || Math.abs(Date.now() - sent) > skew) {
      throw new WebhookRejected('stale or missing x-ms-date');
    }
    const toSign = `POST\n${req.path}\n${date};${req.host};${hash}`;
    const expected = createHmac('sha256', this.o.webhookSecret).update(toSign).digest('base64');
    const signature = /Signature=([A-Za-z0-9+/=]+)$/.exec(auth)?.[1] ?? '';
    if (
      !auth.startsWith('HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&') ||
      !same(signature, expected)
    ) {
      throw new WebhookRejected('bad signature');
    }
    let body;
    try {
      body = webhookSchema.parse(JSON.parse(req.rawBody.toString('utf8')));
    } catch {
      throw new WebhookRejected('unparseable body');
    }
    const outcome = OUTCOMES[body.name];
    if (!outcome) return null; // CREATED and future event names need no action
    return {
      // Duplicated deliveries carry the same body; different events never do.
      eventId: createHash('sha256').update(req.rawBody).digest('hex'),
      reference: body.reference,
      outcome,
    };
  }

  // ---------------------------------------------------------------- HTTP

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch(`${this.o.baseUrl}/accesstoken/get`, {
      method: 'POST',
      headers: {
        client_id: this.o.clientId,
        client_secret: this.o.clientSecret,
        'Ocp-Apim-Subscription-Key': this.o.subscriptionKey,
        'Merchant-Serial-Number': this.o.merchantSerialNumber,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new VippsError(res.status, `access token request failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + Number(body.expires_in) * 1000,
    };
    return this.token.value;
  }

  private async request(method: string, path: string, body?: unknown, idempotencyKey?: string) {
    const res = await fetch(`${this.o.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        'Ocp-Apim-Subscription-Key': this.o.subscriptionKey,
        'Merchant-Serial-Number': this.o.merchantSerialNumber,
        'Vipps-System-Name': 'raadi',
        'Vipps-System-Plugin-Name': 'raadi-payments',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 401) this.token = undefined;
    if (!res.ok) throw new VippsError(res.status, `Vipps ${method} ${path} returned ${res.status}`);
    return res.json() as Promise<unknown>;
  }
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
