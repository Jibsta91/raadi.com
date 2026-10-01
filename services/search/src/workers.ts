import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { topicFor } from '@raadi/events';
import { EventConsumer } from '@raadi/service-kit/kafka';
import type { AppConfig } from './config.js';
import { SearchService } from './search/search.service.js';
import { APP_CONFIG } from './tokens.js';

/** Indexes listing events as they arrive (consumer group "search-indexer"). */
@Injectable()
export class Indexer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Indexer');
  readonly consumer: EventConsumer;

  constructor(search: SearchService, @Inject(APP_CONFIG) cfg: AppConfig) {
    this.consumer = new EventConsumer({
      clientId: 'search',
      groupId: 'search-indexer',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [topicFor('listing')],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => search.onListingEvent(event),
      log: {
        info: (o, m) => this.logger.log(o, m),
        warn: (o, m) => this.logger.warn(o, m),
        error: (o, m) => this.logger.error(o, m),
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
