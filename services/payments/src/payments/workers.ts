import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { PaymentsService } from './payments.service.js';

/**
 * Reconciliation: re-checks open orders with the provider, so a lost webhook
 * or a failed capture never leaves an order stuck.
 */
@Injectable()
export class PaymentWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('PaymentWorkers');
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly payments: PaymentsService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      this.running ??= this.payments
        .reconcile()
        .then((n) => (n ? this.logger.log({ checked: n }, 'reconciled open orders') : undefined))
        .catch((err: unknown) => this.logger.warn({ err }, 'reconciliation failed'))
        .finally(() => (this.running = undefined));
    }, this.cfg.env.RECONCILE_INTERVAL_SECONDS * 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
