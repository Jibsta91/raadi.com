import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { displayName, type ImgproxySigner, type Principal } from '@raadi/service-kit';
import { ListingsClient } from './listings.client.js';
import { MessagingRepository, type Sent } from './messaging.repository.js';
import {
  type Conversation,
  type ConversationDetail,
  type Message,
  type StartConversation,
  toConversation,
  toMessage,
} from './model.js';
import { RealtimeHub } from './realtime.js';

export const SIGNER = Symbol('IMGPROXY_SIGNER');

const meter = metrics.getMeter('messaging');
const sent = meter.createCounter('raadi.messaging.messages_sent', {
  description: 'Messages sent, by whether they opened a new conversation',
});
const refused = meter.createCounter('raadi.messaging.refused', {
  description: 'Conversation starts refused, by reason',
});

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly repo: MessagingRepository,
    private readonly listings: ListingsClient,
    private readonly realtime: RealtimeHub,
    @Inject(SIGNER) private readonly signer: ImgproxySigner,
  ) {}

  /**
   * Contacts the seller of a listing: opens the buyer's conversation about it
   * (or reuses the existing one) and sends the first message.
   */
  async start(
    principal: Principal,
    token: string,
    input: StartConversation,
  ): Promise<{ conversation: Conversation; message: Message; created: boolean }> {
    const existing = await this.repo.findByListingAndBuyer(input.listingId, principal.sub);
    let result: Sent & { created: boolean };
    if (existing) {
      const appended = await this.repo.send(existing.id, principal.sub, input.body);
      result = { ...appended!, created: false };
    } else {
      const contact = await this.listings.contact(input.listingId, token);
      if (contact.ownerId === principal.sub)
        this.refuse('own_listing', 'You cannot message yourself.');
      if (contact.status !== 'active')
        this.refuse('listing_unavailable', 'This listing is no longer available.');
      result = await this.repo.start(
        {
          listingId: contact.listingId,
          listingTitle: contact.title,
          listingImageId: contact.imageId,
          sellerId: contact.ownerId,
          sellerName: contact.sellerName,
          buyerId: principal.sub,
          buyerName: displayName(principal.claims),
        },
        input.body,
      );
    }
    await this.announce(result);
    sent.add(1, { new_conversation: String(result.created) });
    const conversation = await this.conversation(result.conversation.id, principal.sub);
    return {
      conversation,
      message: toMessage(result.message, principal.sub),
      created: result.created,
    };
  }

  async send(principal: Principal, conversationId: string, body: string): Promise<Message> {
    const result = await this.repo.send(conversationId, principal.sub, body);
    if (!result) throw new NotFoundException('Conversation not found');
    await this.announce(result);
    sent.add(1, { new_conversation: 'false' });
    return toMessage(result.message, principal.sub);
  }

  async inbox(principal: Principal, limit: number, offset: number) {
    const { rows, total } = await this.repo.inbox(principal.sub, limit, offset);
    return {
      total,
      limit,
      offset,
      items: rows.map((r) => toConversation(r, principal.sub, this.signer)),
    };
  }

  async detail(
    principal: Principal,
    conversationId: string,
    limit: number,
    before?: string,
  ): Promise<ConversationDetail> {
    const conversation = await this.conversation(conversationId, principal.sub);
    const rows = await this.repo.messages(conversationId, limit + 1, before);
    return {
      ...conversation,
      hasMore: rows.length > limit,
      messages: rows
        .slice(0, limit)
        .reverse()
        .map((r) => toMessage(r, principal.sub)),
    };
  }

  async markRead(principal: Principal, conversationId: string): Promise<void> {
    const entry = await this.repo.inboxEntry(conversationId, principal.sub);
    if (!entry) throw new NotFoundException('Conversation not found');
    await this.repo.markRead(conversationId, principal.sub);
    await this.realtime
      .publish({
        type: 'read',
        participants: [entry.buyer_id, entry.seller_id],
        conversationId,
        readerId: principal.sub,
      })
      .catch((err: unknown) => this.logger.warn({ err }, 'read receipt not published'));
  }

  async unread(principal: Principal): Promise<{ count: number }> {
    return { count: await this.repo.unreadTotal(principal.sub) };
  }

  private async conversation(id: string, userId: string): Promise<Conversation> {
    const entry = await this.repo.inboxEntry(id, userId);
    if (!entry) throw new NotFoundException('Conversation not found');
    return toConversation(entry, userId, this.signer);
  }

  /**
   * Live delivery after the commit. Best effort: the message is already
   * stored, and clients that miss a push catch up when they reload.
   */
  private async announce({ conversation, message }: Sent): Promise<void> {
    await this.realtime
      .publish({
        type: 'message',
        participants: [conversation.buyer_id, conversation.seller_id],
        message,
      })
      .catch((err: unknown) => this.logger.warn({ err }, 'live delivery not published'));
  }

  private refuse(code: string, message: string): never {
    refused.add(1, { reason: code });
    throw new UnprocessableEntityException({
      message,
      errors: [{ path: 'listingId', message, code }],
    });
  }
}
