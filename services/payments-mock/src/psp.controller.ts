import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ZodValidationPipe } from '@raadi/service-kit';
import type { FastifyReply } from 'fastify';
import { PspService } from './psp.service.js';
import {
  type CreatePayment,
  createPaymentSchema,
  modificationSchema,
  PaymentError,
} from './vipps.js';

type H = Record<string, string | undefined>;

/** Maps provider errors to HTTP problems, like the real API's error responses. */
function run<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PaymentError) throw new HttpException(error.message, error.status);
    throw error;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Vipps-compatible API (the subset Raadi uses) and the hosted payment page. */
@Controller()
export class PspController {
  constructor(private readonly psp: PspService) {}

  @Post('accesstoken/get')
  @HttpCode(200)
  token(@Headers() h: H) {
    return { token_type: 'Bearer', ...run(() => this.psp.issueToken(h)) };
  }

  @Post('epayment/v1/payments')
  create(
    @Headers() h: H,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePayment,
    @Res() reply: FastifyReply,
  ): void {
    const res = run(() => {
      this.psp.authorize(h);
      return this.psp.idempotent(h['idempotency-key'], body, () => ({
        status: 201,
        body: this.psp.create(body),
      }));
    });
    void reply.status(res.status).send(res.body);
  }

  @Get('epayment/v1/payments/:reference')
  get(@Headers() h: H, @Param('reference') reference: string) {
    return run(() => {
      this.psp.authorize(h);
      return this.psp.view(reference);
    });
  }

  @Post('epayment/v1/payments/:reference/:op(capture|refund|cancel)')
  modifyPayment(
    @Headers() h: H,
    @Param('reference') reference: string,
    @Param('op') op: 'capture' | 'refund' | 'cancel',
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): void {
    const res = run(() => {
      this.psp.authorize(h);
      const value =
        op === 'cancel' ? undefined : modificationSchema.parse(body).modificationAmount.value;
      return this.psp.idempotent(h['idempotency-key'], { reference, op, body }, () => ({
        status: 200,
        body: this.psp.modify(reference, op, value),
      }));
    });
    void reply.status(res.status).send(res.body);
  }

  // ---------------------------------------------------------------- hosted page

  @Get('pay/:reference')
  page(@Param('reference') reference: string, @Res() reply: FastifyReply): void {
    const p = run(() => this.psp.get(reference));
    const kr = (p.amount.value / 100).toLocaleString('nb-NO', { minimumFractionDigits: 2 });
    const action = (name: string, label: string, style: string) =>
      `<form method="post" action="/pay/${encodeURIComponent(reference)}?action=${name}">` +
      `<button style="${style}">${label}</button></form>`;
    const open = p.state === 'CREATED';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Raadi Pay (test)</title>
<style>body{font-family:system-ui,sans-serif;background:#f6fafa;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border-radius:12px;box-shadow:0 2px 12px #0002;padding:2rem;max-width:24rem;width:90%}
h1{font-size:1.1rem;color:#0b6a70;margin:0 0 1rem}.amount{font-size:2rem;font-weight:700}
.note{font-size:.8rem;color:#4b5b60;margin-top:1.5rem}button{width:100%;padding:.75rem;border-radius:8px;
border:1px solid #0b6a70;font-size:1rem;margin-top:.5rem;cursor:pointer}</style></head><body><main>
<h1>Raadi Pay — test payment</h1>
<p>${esc(p.description)}</p><p class="amount" data-testid="pay-amount">kr ${kr}</p>
${
  open
    ? action('approve', 'Approve payment', 'background:#0b6a70;color:#fff') +
      action('decline', 'Decline', 'background:#fff;color:#0b6a70') +
      action(
        'approve-silent',
        'Approve, but lose the webhook (tests reconciliation)',
        'background:#fff;color:#4b5b60;border-color:#ccd',
      )
    : `<p>This payment is ${esc(p.state.toLowerCase())}.</p>`
}
<p class="note">Development stand-in for Vipps MobilePay. No money moves.</p>
</main></body></html>`;
    void reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(html);
  }

  @Post('pay/:reference')
  choose(
    @Param('reference') reference: string,
    @Query('action') action: string,
    @Res() reply: FastifyReply,
  ): void {
    if (!['approve', 'decline', 'approve-silent'].includes(action)) {
      throw new HttpException('unknown action', 400);
    }
    const back = run(() =>
      this.psp.choose(reference, action !== 'decline', action === 'approve-silent'),
    );
    void reply.status(303).header('location', back).send();
  }
}
