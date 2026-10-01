import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { parseEvent } from '@raadi/events';
import type { Principal } from '@raadi/service-kit';
import { PermanentEventError, type ReceivedEvent } from '@raadi/service-kit/kafka';
import type { Transporter } from 'nodemailer';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';
import { UserDirectory } from './directory.js';
import { type EmailRow, type Preferences, retryDelayMs, toNotification } from './model.js';
import { NotificationsRepository } from './notifications.repository.js';
import { renderEmail } from './templates.js';

export const MAILER = Symbol('MAILER');

const meter = metrics.getMeter('notifications');
const emails = meter.createCounter('raadi.notifications.emails', {
  description:
    'E-mails by kind and outcome (queued, throttled, opted_out, sent, skipped, retry, failed)',
});
const created = meter.createCounter('raadi.notifications.created', {
  description: 'In-app notifications created, by kind',
});

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repo: NotificationsRepository,
    private readonly directory: UserDirectory,
    @Inject(MAILER) private readonly mailer: Transporter,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  // ---------------------------------------------------------------- events

  /** Turns domain events into notifications and queued e-mails (exactly once per event). */
  async onEvent(event: ReceivedEvent): Promise<void> {
    let parsed;
    try {
      parsed = parseEvent(event.value);
    } catch (error) {
      throw new PermanentEventError('event violates its contract', { cause: error });
    }
    if (!parsed) return; // a newer event type this build does not know

    switch (parsed.type) {
      case 'no.raadi.messaging.conversation.message_sent.v1': {
        const { recipientId, conversationId } = parsed.data;
        await this.repo.once(parsed.id, async (tx) => {
          const prefs = await this.repo.preferences(recipientId, tx.client);
          if (!prefs.emailMessages)
            return void emails.add(1, { kind: 'new_message', outcome: 'opted_out' });
          const queued = await tx.queueEmail({
            userId: recipientId,
            kind: 'new_message',
            refId: conversationId,
            throttleMinutes: this.cfg.env.EMAIL_THROTTLE_MINUTES,
          });
          emails.add(1, { kind: 'new_message', outcome: queued ? 'queued' : 'throttled' });
        });
        return;
      }
      case 'no.raadi.listings.listing.deleted.v1': {
        const { listingId, ownerId, title, reason } = parsed.data;
        // Owners who delete their own listing need no notice; older events lack the fields.
        if (reason !== 'moderation' || !ownerId) return;
        const params = { title: title ?? '' };
        await this.repo.once(parsed.id, async (tx) => {
          await tx.notify(ownerId, 'listing_removed', listingId, params);
          await tx.queueEmail({
            userId: ownerId,
            kind: 'listing_removed',
            refId: listingId,
            params,
          });
        });
        created.add(1, { kind: 'listing_removed' });
        emails.add(1, { kind: 'listing_removed', outcome: 'queued' });
        return;
      }
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- e-mail

  /** Sends the due e-mails once; returns how many were handled. Called by the sender loop. */
  async sendDue(batch = 10): Promise<number> {
    const due = await this.repo.claimDue(batch, 120_000);
    for (const email of due) await this.deliver(email);
    return due.length;
  }

  private async deliver(email: EmailRow): Promise<void> {
    try {
      const recipient = await this.directory.recipient(email.user_id);
      if (!recipient) {
        await this.repo.finish(email.id, 'skipped', 'no deliverable address');
        return void emails.add(1, { kind: email.kind, outcome: 'skipped' });
      }
      const base = `${this.cfg.env.PUBLIC_BASE_URL}/${recipient.locale}`;
      const action =
        email.kind === 'new_message' ? `${base}/messages/${email.ref_id}` : `${base}/my/listings`;
      const rendered = renderEmail(email.kind, recipient.locale, email.params, {
        action,
        settings: `${base}/notifications`,
      });
      await this.mailer.sendMail({
        from: this.cfg.env.SMTP_FROM,
        to: recipient.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { 'X-Raadi-Notification': email.kind },
      });
      await this.repo.finish(email.id, 'sent');
      emails.add(1, { kind: email.kind, outcome: 'sent' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (email.attempts >= this.cfg.env.EMAIL_MAX_ATTEMPTS) {
        await this.repo.finish(email.id, 'failed', message);
        emails.add(1, { kind: email.kind, outcome: 'failed' });
        this.logger.error({ err: error, emailId: email.id }, 'e-mail given up');
      } else {
        await this.repo.retryLater(email.id, retryDelayMs(email.attempts), message);
        emails.add(1, { kind: email.kind, outcome: 'retry' });
        this.logger.warn(
          { err: error, emailId: email.id, attempts: email.attempts },
          'e-mail will be retried',
        );
      }
    }
  }

  // ---------------------------------------------------------------- API

  async list(principal: Principal, limit: number) {
    const [rows, unread] = await Promise.all([
      this.repo.list(principal.sub, limit),
      this.repo.unread(principal.sub),
    ]);
    return { unread, items: rows.map(toNotification) };
  }

  async unread(principal: Principal) {
    return { count: await this.repo.unread(principal.sub) };
  }

  async markRead(principal: Principal, id: string): Promise<void> {
    if (!(await this.repo.markRead(principal.sub, id)))
      throw new NotFoundException('Notification not found');
  }

  async markAllRead(principal: Principal): Promise<void> {
    await this.repo.markAllRead(principal.sub);
  }

  preferences(principal: Principal): Promise<Preferences> {
    return this.repo.preferences(principal.sub);
  }

  savePreferences(principal: Principal, prefs: Preferences): Promise<Preferences> {
    return this.repo.savePreferences(principal.sub, prefs);
  }
}
