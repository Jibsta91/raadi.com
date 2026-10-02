import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { FgaClient, HealthRegistry } from '@raadi/service-kit';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import { PromotionsConsumer } from './listings/promotions.consumer.js';
import { APP_CONFIG, PG_POOL } from './tokens.js';

/** Readiness checks for every hard dependency, and pool shutdown. */
@Injectable()
export class Lifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly health: HealthRegistry,
    private readonly fga: FgaClient,
    private readonly promotions: PromotionsConsumer,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onModuleInit(): void {
    this.health.register('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
    this.health.register('openfga', () => this.fga.ping());
    this.health.register('kafka', async () => this.promotions.consumer.healthy());
    this.health.register('opa', async () => {
      const res = await fetch(`${this.cfg.env.OPA_URL}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`OPA health returned ${res.status}`);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
