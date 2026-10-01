import { Injectable, type OnModuleInit } from '@nestjs/common';
import { HealthRegistry } from '@raadi/service-kit';
import { SearchIndex } from './search/search.index.js';
import { Indexer } from './workers.js';

/** Creates the index on start and registers readiness checks. */
@Injectable()
export class Lifecycle implements OnModuleInit {
  constructor(
    private readonly health: HealthRegistry,
    private readonly index: SearchIndex,
    private readonly indexer: Indexer,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.index.ensureIndex();
    this.health.register('opensearch', () => this.index.ping());
    this.health.register('kafka', async () => this.indexer.consumer.healthy());
  }
}
