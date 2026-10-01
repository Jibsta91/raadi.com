import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { buildEvent } from '@raadi/events';
import { appendToOutbox, withTransaction } from '@raadi/service-kit';
import type pg from 'pg';
import { PG_POOL } from '../tokens.js';
import type { ConversationRow, InboxRow, MessageRow } from './model.js';

export interface NewConversation {
  listingId: string;
  listingTitle: string;
  listingImageId: string | null;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
}

export interface Sent {
  conversation: ConversationRow;
  message: MessageRow;
}

/** Inbox columns for one viewer ($1): latest message and unread count. */
const INBOX_SELECT = `
  SELECT c.*, lm.body AS last_body, lm.sender_id AS last_sender_id, lm.created_at AS last_sent_at,
         (SELECT count(*) FROM messages m
           WHERE m.conversation_id = c.id AND m.sender_id <> $1
             AND m.created_at > CASE WHEN c.buyer_id = $1 THEN c.buyer_read_at ELSE c.seller_read_at END
         ) AS unread
    FROM conversations c
    LEFT JOIN LATERAL (
      SELECT body, sender_id, created_at FROM messages
       WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) lm ON true`;

/**
 * Conversations and messages. Every read and write is scoped to a participant
 * in SQL, so a conversation id alone never reveals anything.
 */
@Injectable()
export class MessagingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async findByListingAndBuyer(listingId: string, buyerId: string): Promise<ConversationRow | null> {
    const { rows } = await this.pool.query<ConversationRow>(
      'SELECT * FROM conversations WHERE listing_id = $1 AND buyer_id = $2',
      [listingId, buyerId],
    );
    return rows[0] ?? null;
  }

  /**
   * Opens the conversation (or reuses the buyer's existing one for this
   * listing) and sends the first message, atomically with its event.
   */
  async start(input: NewConversation, body: string): Promise<Sent & { created: boolean }> {
    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<ConversationRow>(
        `INSERT INTO conversations
           (id, listing_id, listing_title, listing_image_id, seller_id, seller_name, buyer_id, buyer_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (listing_id, buyer_id) DO NOTHING
         RETURNING *`,
        [
          randomUUID(),
          input.listingId,
          input.listingTitle,
          input.listingImageId,
          input.sellerId,
          input.sellerName,
          input.buyerId,
          input.buyerName,
        ],
      );
      const conversation =
        inserted.rows[0] ??
        (
          await client.query<ConversationRow>(
            'SELECT * FROM conversations WHERE listing_id = $1 AND buyer_id = $2 FOR UPDATE',
            [input.listingId, input.buyerId],
          )
        ).rows[0]!;
      const sent = await this.append(client, conversation, input.buyerId, body);
      return { ...sent, created: inserted.rows.length > 0 };
    });
  }

  /** Sends a message if the sender takes part in the conversation; null otherwise. */
  async send(conversationId: string, senderId: string, body: string): Promise<Sent | null> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<ConversationRow>(
        `SELECT * FROM conversations WHERE id = $1 AND $2 IN (buyer_id, seller_id) FOR UPDATE`,
        [conversationId, senderId],
      );
      const conversation = rows[0];
      return conversation ? this.append(client, conversation, senderId, body) : null;
    });
  }

  private async append(
    client: pg.PoolClient,
    conversation: ConversationRow,
    senderId: string,
    body: string,
  ): Promise<Sent> {
    const id = randomUUID();
    const { rows } = await client.query<MessageRow>(
      `INSERT INTO messages (id, conversation_id, sender_id, body) VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, conversation.id, senderId, body],
    );
    const message = rows[0]!;
    // Sending also marks the conversation read for the sender.
    const updated = await client.query<ConversationRow>(
      `UPDATE conversations
          SET last_message_at = $2,
              buyer_read_at  = CASE WHEN buyer_id  = $3 THEN $2 ELSE buyer_read_at  END,
              seller_read_at = CASE WHEN seller_id = $3 THEN $2 ELSE seller_read_at END
        WHERE id = $1 RETURNING *`,
      [conversation.id, message.created_at, senderId],
    );
    const recipientId =
      conversation.buyer_id === senderId ? conversation.seller_id : conversation.buyer_id;
    await appendToOutbox(
      client,
      'conversation',
      conversation.id,
      buildEvent('no.raadi.messaging.conversation.message_sent.v1', {
        source: 'urn:raadi:messaging',
        subject: conversation.id,
        data: {
          conversationId: conversation.id,
          messageId: message.id,
          listingId: conversation.listing_id,
          senderId,
          recipientId,
          sentAt: message.created_at.toISOString(),
        },
      }),
    );
    return { conversation: updated.rows[0]!, message };
  }

  async inbox(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ rows: InboxRow[]; total: number }> {
    const [page, count] = await Promise.all([
      this.pool.query<InboxRow>(
        `${INBOX_SELECT}
          WHERE c.buyer_id = $1 OR c.seller_id = $1
          ORDER BY c.last_message_at DESC, c.id
          LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      this.pool.query<{ n: string }>(
        'SELECT count(*) AS n FROM conversations WHERE buyer_id = $1 OR seller_id = $1',
        [userId],
      ),
    ]);
    return { rows: page.rows, total: Number(count.rows[0]!.n) };
  }

  async inboxEntry(conversationId: string, userId: string): Promise<InboxRow | null> {
    const { rows } = await this.pool.query<InboxRow>(
      `${INBOX_SELECT} WHERE c.id = $2 AND $1 IN (c.buyer_id, c.seller_id)`,
      [userId, conversationId],
    );
    return rows[0] ?? null;
  }

  /** Newest first, at most `limit`, optionally only those sent before a time. */
  async messages(conversationId: string, limit: number, before?: string): Promise<MessageRow[]> {
    const { rows } = await this.pool.query<MessageRow>(
      `SELECT * FROM messages
        WHERE conversation_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
        ORDER BY created_at DESC, id DESC LIMIT $3`,
      [conversationId, before ?? null, limit],
    );
    return rows;
  }

  /** Marks everything up to now as read for the participant; false if not a participant. */
  async markRead(conversationId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE conversations
          SET buyer_read_at  = CASE WHEN buyer_id  = $2 THEN now() ELSE buyer_read_at  END,
              seller_read_at = CASE WHEN seller_id = $2 THEN now() ELSE seller_read_at END
        WHERE id = $1 AND $2 IN (buyer_id, seller_id)`,
      [conversationId, userId],
    );
    return rowCount === 1;
  }

  /** Unread messages across all of the user's conversations. */
  async unreadTotal(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE (c.buyer_id = $1 OR c.seller_id = $1) AND m.sender_id <> $1
          AND m.created_at > CASE WHEN c.buyer_id = $1 THEN c.buyer_read_at ELSE c.seller_read_at END`,
      [userId],
    );
    return Number(rows[0]!.n);
  }
}
