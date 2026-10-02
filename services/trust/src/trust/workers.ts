import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { topicFor } from '@raadi/events';
import { EventConsumer } from '@raadi/service-kit/kafka';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { TrustService } from './trust.service.js';

const PRUNE_INTERVAL_MS = 15 * 60_000;

/**
 * Background work: the event consumer (group "trust") that keeps the listing
 * and contact projections current, and pruning of abandoned verification
 * redirects.
 */
@Injectable()
export class TrustWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('TrustWorkers');
  readonly consumer: EventConsumer;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly trust: TrustService,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.consumer = new EventConsumer({
      clientId: 'trust',
      groupId: 'trust',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [topicFor('listing'), topicFor('conversation')],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => trust.onEvent(event),
      log: {
        info: (o, m) => this.logger.log(o, m),
        warn: (o, m) => this.logger.warn(o, m),
        error: (o, m) => this.logger.error(o, m),
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
    this.timer = setInterval(() => {
      this.trust.pruneRequests().catch((err: unknown) => this.logger.warn({ err }, 'prune failed'));
    }, PRUNE_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.consumer.stop();
  }
}
