import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { FgaClient, HealthRegistry } from '@raadi/service-kit';
import type pg from 'pg';
import { ClamAvScanner } from './media/clamav.js';
import { MediaStorage } from './media/storage.js';
import { MediaWorkers } from './media/workers.js';
import { PG_POOL } from './tokens.js';

/** Readiness checks for every hard dependency; buckets are created on start. */
@Injectable()
export class Lifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly health: HealthRegistry,
    private readonly fga: FgaClient,
    private readonly storage: MediaStorage,
    private readonly scanner: ClamAvScanner,
    private readonly workers: MediaWorkers,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.storage.ensureBuckets();
    this.health.register('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
    this.health.register('s3', () => this.storage.ping());
    this.health.register('clamav', () => this.scanner.ping());
    this.health.register('openfga', () => this.fga.ping());
    this.health.register('kafka', async () => this.workers.consumer.healthy());
  }

  async onApplicationShutdown(): Promise<void> {
    this.storage.close();
    await this.pool.end().catch(() => undefined);
  }
}
