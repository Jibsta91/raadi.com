import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { AppConfig } from './config.js';
import {
  type CreatePayment,
  decide,
  type EventName,
  modify,
  newPayment,
  type Payment,
  PaymentError,
  safeEqual,
  signWebhook,
  view,
  webhookBody,
} from './vipps.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

const MAX_PAYMENTS = 10_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

interface Replay {
  hash: string;
  status: number;
  body: unknown;
}

/**
 * In-memory payment provider. State is lost on restart, which is fine for a
 * development stand-in: Raadi reconciles against GET and treats unknown
 * payments as failed.
 */
@Injectable()
export class PspService implements OnApplicationShutdown {
  private readonly logger = new Logger('PSP');
  private readonly payments = new Map<string, Payment>();
  private readonly tokens = new Map<string, number>();
  private readonly replays = new Map<string, Replay>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly sweep: NodeJS.Timeout;

  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {
    this.sweep = setInterval(() => this.expireOld(), 30_000);
    this.sweep.unref();
  }

  // ---------------------------------------------------------------- auth

  issueToken(h: Record<string, string | undefined>): { access_token: string; expires_in: string } {
    const { env, secrets } = this.cfg;
    const ok =
      safeEqual(h.client_id ?? '', env.VIPPS_CLIENT_ID) &&
      safeEqual(h.client_secret ?? '', secrets.client_secret) &&
      safeEqual(h['ocp-apim-subscription-key'] ?? '', secrets.subscription_key) &&
      safeEqual(h['merchant-serial-number'] ?? '', env.VIPPS_MSN);
    if (!ok) throw new PaymentError(401, 'invalid client credentials');
    const token = randomBytes(32).toString('base64url');
    this.tokens.set(token, Date.now() + 3_600_000);
    return { access_token: token, expires_in: '3600' };
  }

  authorize(h: Record<string, string | undefined>): void {
    const token = h.authorization?.replace(/^Bearer /, '') ?? '';
    const expires = this.tokens.get(token);
    if (!expires || expires < Date.now()) throw new PaymentError(401, 'invalid or expired token');
    if (!safeEqual(h['ocp-apim-subscription-key'] ?? '', this.cfg.secrets.subscription_key)) {
      throw new PaymentError(401, 'invalid subscription key');
    }
    if (h['merchant-serial-number'] !== this.cfg.env.VIPPS_MSN) {
      throw new PaymentError(403, 'unknown merchant serial number');
    }
  }

  /**
   * Idempotent writes: the same key with the same body replays the first
   * response; the same key with a different body is a conflict.
   */
  idempotent(key: string | undefined, body: unknown, run: () => { status: number; body: unknown }) {
    if (!key || key.length > 128) throw new PaymentError(400, 'Idempotency-Key header is required');
    const hash = createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
    const seen = this.replays.get(key);
    if (seen) {
      if (seen.hash !== hash)
        throw new PaymentError(409, 'Idempotency-Key reused with a different body');
      return { status: seen.status, body: seen.body };
    }
    const result = run();
    this.replays.set(key, { hash, ...result });
    return result;
  }

  // ---------------------------------------------------------------- payments

  create(input: CreatePayment) {
    if (this.payments.has(input.reference)) throw new PaymentError(409, 'reference already used');
    if (this.payments.size >= MAX_PAYMENTS)
      this.payments.delete(this.payments.keys().next().value!);
    const p = newPayment(input);
    this.payments.set(p.reference, p);
    return { redirectUrl: this.payUrl(p.reference), reference: p.reference };
  }

  get(reference: string): Payment {
    const p = this.payments.get(reference);
    if (!p) throw new PaymentError(404, 'payment not found');
    this.expire(p);
    return p;
  }

  view(reference: string) {
    return view(this.get(reference), this.payUrl(reference));
  }

  modify(reference: string, op: 'capture' | 'refund' | 'cancel', value?: number) {
    const p = this.get(reference);
    const event = modify(p, op, value);
    this.deliver(p, event, op === 'cancel' ? p.cancelled || p.amount.value : value!);
    return view(p, this.payUrl(reference));
  }

  /** The user's choice on the hosted page; `silent` skips the webhook (tests reconciliation). */
  choose(reference: string, approve: boolean, silent: boolean): string {
    const p = this.get(reference);
    const event = decide(p, approve);
    if (!silent) this.deliver(p, event, p.amount.value);
    const back = new URL(p.returnUrl);
    return back.href;
  }

  payUrl(reference: string): string {
    return `${this.cfg.env.PUBLIC_URL}/pay/${encodeURIComponent(reference)}`;
  }

  // ---------------------------------------------------------------- webhooks

  private deliver(p: Payment, name: EventName, value: number): void {
    const body = JSON.stringify(webhookBody(p, this.cfg.env.VIPPS_MSN, name, value));
    const copies = this.cfg.env.DUPLICATE_WEBHOOKS ? 2 : 1;
    for (let i = 0; i < copies; i++)
      this.schedule(() => this.send(body, name, p.reference, 0), 300 + i * 700);
  }

  private async send(
    body: string,
    name: EventName,
    reference: string,
    attempt: number,
  ): Promise<void> {
    const url = new URL(this.cfg.env.WEBHOOK_URL);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: signWebhook(this.cfg.secrets.webhook_secret, url, body),
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`webhook returned ${res.status}`);
      this.logger.log({ reference, event: name }, 'webhook delivered');
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        return void this.logger.warn({ reference, event: name, err }, 'webhook given up');
      }
      this.schedule(() => this.send(body, name, reference, attempt + 1), delay);
    }
  }

  private schedule(fn: () => Promise<void>, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      void fn();
    }, ms);
    this.timers.add(t);
  }

  private expire(p: Payment): void {
    const age = Date.now() - p.createdAt.getTime();
    if (p.state === 'CREATED' && age > this.cfg.env.EXPIRY_MINUTES * 60_000) {
      p.state = 'EXPIRED';
      this.deliver(p, 'EXPIRED', p.amount.value);
    }
  }

  private expireOld(): void {
    for (const p of this.payments.values()) this.expire(p);
  }

  onApplicationShutdown(): void {
    clearInterval(this.sweep);
    for (const t of this.timers) clearTimeout(t);
  }
}
