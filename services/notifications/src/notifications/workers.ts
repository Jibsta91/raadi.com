import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { topicFor } from '@raadi/events';
import { EventConsumer } from '@raadi/service-kit/kafka';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';

const SEND_INTERVAL_MS = 5_000;

/**
 * Background work: the event consumer (group "notifications") and the
 * e-mail sender loop. The consumer only writes rows; sending happens here,
 * so a slow or failing mail server never blocks event processing.
 */
@Injectable()
export class NotificationWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('NotificationWorkers');
  readonly consumer: EventConsumer;
  private timer?: NodeJS.Timeout;
  private sending?: Promise<void>;

  constructor(
    private readonly notifications: NotificationsService,
    repo: NotificationsRepository,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.consumer = new EventConsumer({
      clientId: 'notifications',
      groupId: 'notifications',
      brokers: cfg.env.KAFKA_BROKERS.split(','),
      username: cfg.env.KAFKA_USERNAME,
      password: cfg.secrets.kafka_password,
      topics: [
        topicFor('conversation'),
        topicFor('listing'),
        topicFor('review'),
        topicFor('payment'),
      ],
      deadLetterTopic: 'raadi.dlq',
      handle: (event) => notifications.onEvent(event),
      log: {
        info: (o, m) => this.logger.log(o, m),
        warn: (o, m) => this.logger.warn(o, m),
        error: (o, m) => this.logger.error(o, m),
      },
    });
    metrics
      .getMeter('notifications')
      .createObservableGauge('raadi.notifications.email_queue', {
        description: 'E-mails waiting to be sent (including those waiting for a retry)',
      })
      .addCallback(async (r) => r.observe(await repo.pendingCount().catch(() => 0)));
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start();
    this.timer = setInterval(() => {
      // One send round at a time per instance; other instances are kept off
      // the same e-mails by the lease in claimDue.
      this.sending ??= this.sendRound().finally(() => (this.sending = undefined));
    }, SEND_INTERVAL_MS);
    this.timer.unref();
  }

  private async sendRound(): Promise<void> {
    try {
      while ((await this.notifications.sendDue()) > 0) {
        /* keep draining while there is a backlog */
      }
    } catch (err) {
      this.logger.warn({ err }, 'e-mail round failed');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.sending;
    await this.consumer.stop();
  }
}
