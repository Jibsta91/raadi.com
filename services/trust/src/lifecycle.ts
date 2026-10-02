import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { HealthRegistry } from '@raadi/service-kit';
import type pg from 'pg';
import { TrustWorkers } from './trust/workers.js';
import { PG_POOL } from './tokens.js';

/**
 * Readiness: the database and the event consumer. BankID is a soft
 * dependency: while it is down only verification fails (reviews and profiles
 * keep working).
 */
@Injectable()
export class Lifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly health: HealthRegistry,
    private readonly workers: TrustWorkers,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  onModuleInit(): void {
    this.health.register('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
    this.health.register('kafka', async () => this.workers.consumer.healthy());
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
