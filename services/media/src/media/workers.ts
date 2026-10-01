import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { EventConsumer } from '@raadi/service-kit/kafka';
import { topicFor } from '@raadi/events';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { MediaService } from './media.service.js';

/**
 * Background work: the listing-events consumer (image attachment) and the
 * periodic garbage collection of unattached uploads.
 */
@Injectable()
export class MediaWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('MediaWorkers');
  readonly consumer: EventConsumer;
  private gcTimer?: NodeJS.Timeout;

  constructor(
    private readonly media: MediaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {
    this.consumer = new EventConsumer({
      clientId: 'media',
      groupId: 'media-listing-sync',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [topicFor('listing')],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => this.media.onListingEvent(event),
      log: {
        info: (o, m) => this.logger.log(o, m),
        warn: (o, m) => this.logger.warn(o, m),
        error: (o, m) => this.logger.error(o, m),
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
    const run = () =>
      this.media
        .collectOrphans(this.cfg.env.ORPHAN_TTL_HOURS)
        .catch((err: unknown) => this.logger.warn({ err }, 'orphan collection failed'));
    this.gcTimer = setInterval(run, 10 * 60_000);
    this.gcTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.gcTimer) clearInterval(this.gcTimer);
    await this.consumer.stop();
  }
}
