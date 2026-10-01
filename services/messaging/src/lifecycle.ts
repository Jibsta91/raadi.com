import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { HealthRegistry } from '@raadi/service-kit';
import type { Server } from 'node:http';
import type pg from 'pg';
import { RealtimeHub } from './messaging/realtime.js';
import { PG_POOL } from './tokens.js';

/** Readiness checks, the WebSocket hub's lifecycle and pool shutdown. */
@Injectable()
export class Lifecycle implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly health: HealthRegistry,
    private readonly realtime: RealtimeHub,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  onModuleInit(): void {
    this.health.register('postgres', async () => {
      await this.pool.query('SELECT 1');
    });
    this.health.register('valkey', () => this.realtime.check());
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.realtime.start(this.adapterHost.httpAdapter.getHttpServer() as Server);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.realtime.close().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
