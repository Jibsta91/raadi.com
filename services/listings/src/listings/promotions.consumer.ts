import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { parseEvent, topicFor } from '@raadi/events';
import { EventConsumer, PermanentEventError, type ReceivedEvent } from '@raadi/service-kit/kafka';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { ListingsRepository } from './listings.repository.js';

/** Applies paid promotions from payments to listings (group "listings-promotions"). */
@Injectable()
export class PromotionsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('PromotionsConsumer');
  readonly consumer: EventConsumer;

  constructor(
    private readonly repo: ListingsRepository,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.consumer = new EventConsumer({
      clientId: 'listings',
      groupId: 'listings-promotions',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [topicFor('promotion')],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => this.onEvent(event),
      log: {
        info: (o, m) => this.logger.log(o, m),
        warn: (o, m) => this.logger.warn(o, m),
        error: (o, m) => this.logger.error(o, m),
      },
    });
  }

  async onEvent(event: ReceivedEvent): Promise<void> {
    let parsed;
    try {
      parsed = parseEvent(event.value);
    } catch (error) {
      throw new PermanentEventError('event violates its contract', { cause: error });
    }
    if (parsed?.type !== 'no.raadi.payments.promotion.changed.v1') return;
    const { listingId, promotedUntil } = parsed.data;
    await this.repo.applyPromotion(
      parsed.id,
      listingId,
      promotedUntil ? new Date(promotedUntil) : null,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.consumer.stop();
  }
}
