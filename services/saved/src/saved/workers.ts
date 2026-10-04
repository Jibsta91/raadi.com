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
import { SavedService } from './saved.service.js';

const MATCH_TICK_MS = 5_000;

/**
 * Background work: the listing-event consumer (group "saved") that keeps
 * favourites current and raises price-drop and sold alerts, and the saved
 * search matcher that runs every due search.
 */
@Injectable()
export class SavedWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('SavedWorkers');
  readonly consumer: EventConsumer;
  private timer?: NodeJS.Timeout;
  private matching?: Promise<void>;

  constructor(
    private readonly saved: SavedService,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.consumer = new EventConsumer({
      clientId: 'saved',
      groupId: 'saved',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [topicFor('listing')],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => saved.onEvent(event),
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
      // One round at a time per instance; the lease keeps instances apart.
      this.matching ??= this.matchRound().finally(() => (this.matching = undefined));
    }, MATCH_TICK_MS);
    this.timer.unref();
  }

  private async matchRound(): Promise<void> {
    try {
      while ((await this.saved.checkDueSearches()) > 0) {
        /* keep going while searches are due */
      }
    } catch (err) {
      this.logger.warn({ err }, 'saved-search round failed');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.matching;
    await this.consumer.stop();
  }
}
