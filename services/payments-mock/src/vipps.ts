import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/*
 * The subset of the Vipps MobilePay ePayment API this mock implements, with the
 * same shapes, states and webhook signatures as the real API, so Raadi's Vipps
 * adapter runs unchanged against it.
 */

export const amountSchema = z.object({
  currency: z.literal('NOK'),
  value: z.number().int().min(1),
});
export type Amount = z.infer<typeof amountSchema>;

export const createPaymentSchema = z.object({
  amount: amountSchema,
  paymentMethod: z.object({ type: z.enum(['WALLET', 'CARD']) }),
  reference: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  returnUrl: z.url(),
  userFlow: z.enum(['WEB_REDIRECT']),
  paymentDescription: z.string().min(1).max(100),
});
export type CreatePayment = z.infer<typeof createPaymentSchema>;

export const modificationSchema = z.object({ modificationAmount: amountSchema });

export type State = 'CREATED' | 'AUTHORIZED' | 'ABORTED' | 'EXPIRED' | 'TERMINATED';
export type EventName =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'ABORTED'
  | 'EXPIRED'
  | 'CAPTURED'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'TERMINATED';

export interface Payment {
  reference: string;
  pspReference: string;
  amount: Amount;
  state: State;
  description: string;
  returnUrl: string;
  authorized: number;
  captured: number;
  refunded: number;
  cancelled: number;
  createdAt: Date;
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function newPayment(input: CreatePayment): Payment {
  return {
    reference: input.reference,
    pspReference: randomUUID(),
    amount: input.amount,
    state: 'CREATED',
    description: input.paymentDescription,
    returnUrl: input.returnUrl,
    authorized: 0,
    captured: 0,
    refunded: 0,
    cancelled: 0,
    createdAt: new Date(),
  };
}

/** The user's choice on the hosted page. */
export function decide(p: Payment, approve: boolean): EventName {
  if (p.state !== 'CREATED') throw new PaymentError(409, `payment is ${p.state}`);
  if (approve) {
    p.state = 'AUTHORIZED';
    p.authorized = p.amount.value;
    return 'AUTHORIZED';
  }
  p.state = 'ABORTED';
  return 'ABORTED';
}

/** Capture, refund or cancel, with the amount rules of the real API. */
export function modify(p: Payment, op: 'capture' | 'refund' | 'cancel', value = 0): EventName {
  const open = p.authorized - p.captured - p.cancelled;
  switch (op) {
    case 'capture':
      if (p.state !== 'AUTHORIZED')
        throw new PaymentError(409, `cannot capture a ${p.state} payment`);
      if (value > open) throw new PaymentError(400, 'capture exceeds the authorized amount');
      p.captured += value;
      return 'CAPTURED';
    case 'refund':
      if (value > p.captured - p.refunded)
        throw new PaymentError(400, 'refund exceeds the captured amount');
      p.refunded += value;
      return 'REFUNDED';
    case 'cancel':
      if (p.state === 'CREATED') {
        p.state = 'TERMINATED';
        return 'TERMINATED';
      }
      if (p.state !== 'AUTHORIZED')
        throw new PaymentError(409, `cannot cancel a ${p.state} payment`);
      p.cancelled += open;
      return 'CANCELLED';
  }
}

const nok = (value: number) => ({ currency: 'NOK' as const, value });

/** GET /epayment/v1/payments/{reference} body. */
export function view(p: Payment, redirectUrl: string) {
  return {
    aggregate: {
      authorizedAmount: nok(p.authorized),
      cancelledAmount: nok(p.cancelled),
      capturedAmount: nok(p.captured),
      refundedAmount: nok(p.refunded),
    },
    amount: p.amount,
    state: p.state,
    paymentMethod: { type: 'WALLET' },
    pspReference: p.pspReference,
    redirectUrl,
    reference: p.reference,
  };
}

/** Webhook body for an event (Vipps ePayment webhooks). */
export function webhookBody(p: Payment, msn: string, name: EventName, value: number) {
  return {
    msn,
    reference: p.reference,
    pspReference: p.pspReference,
    name,
    amount: nok(value),
    timestamp: new Date().toISOString(),
    idempotencyKey: null,
    success: true,
  };
}

/**
 * Vipps webhook request signing (HMAC-SHA256 over method, path, date, host and
 * the body's SHA-256). Returns the headers to send.
 */
export function signWebhook(
  secret: string,
  url: URL,
  body: string,
  date = new Date(),
): Record<string, string> {
  const contentHash = createHash('sha256').update(body).digest('base64');
  const msDate = date.toUTCString();
  const toSign = `POST\n${url.pathname}${url.search}\n${msDate};${url.host};${contentHash}`;
  const signature = createHmac('sha256', secret).update(toSign).digest('base64');
  return {
    'content-type': 'application/json',
    'x-ms-date': msDate,
    'x-ms-content-sha256': contentHash,
    authorization: `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${signature}`,
  };
}

/** Constant-time string comparison for secrets and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
