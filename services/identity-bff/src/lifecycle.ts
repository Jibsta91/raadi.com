import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { HealthRegistry } from '@raadi/service-kit';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import type { Valkey } from './infra/clients.js';
import { APP_CONFIG, PG_POOL, VALKEY } from './tokens.js';

/** Registers readiness checks and closes connections on shutdown. */
@Injectable()
export class Lifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly health: HealthRegistry,
    @Inject(VALKEY) private readonly valkey: Valkey,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  onModuleInit(): void {
    this.health.register('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
    this.health.register('valkey', async () => {
      if ((await this.valkey.ping()) !== 'PONG') throw new Error('unexpected PING reply');
    });
    this.health.register('keycloak', async () => {
      const res = await fetch(`${this.cfg.realmInternalUrl}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`discovery returned ${res.status}`);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.valkey.quit()]);
  }
}
