import { type ImgproxySigner, imageUrls } from '@raadi/service-kit';
import { z } from 'zod';

/** Message text: trimmed, 1–2000 characters, no control characters except newlines and tabs. */
const body = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  // eslint-disable-next-line no-control-regex
  .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), {
    message: 'Control characters are not allowed',
  });

export const startConversationSchema = z.object({ listingId: z.uuid(), body }).strict();
export type StartConversation = z.infer<typeof startConversationSchema>;

export const sendMessageSchema = z.object({ body }).strict();
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(5_000).default(0),
});

export const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Cursor: only messages sent before this time (ISO 8601), for loading older history. */
  before: z.iso.datetime({ offset: true }).optional(),
});

export interface ConversationRow {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_image_id: string | null;
  seller_id: string;
  seller_name: string;
  buyer_id: string;
  buyer_name: string;
  created_at: Date;
  last_message_at: Date;
  buyer_read_at: Date;
  seller_read_at: Date;
}

/** A conversation row with the viewer's inbox details (latest message, unread count). */
export interface InboxRow extends ConversationRow {
  last_body: string | null;
  last_sender_id: string | null;
  last_sent_at: Date | null;
  unread: string | number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  fromMe: boolean;
  body: string;
  sentAt: string;
}

export interface Conversation {
  id: string;
  role: 'buyer' | 'seller';
  listing: { id: string; title: string; image: { thumb: string } | null };
  counterpart: { id: string; name: string };
  lastMessage: { body: string; fromMe: boolean; sentAt: string } | null;
  unread: number;
  createdAt: string;
  lastMessageAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
  hasMore: boolean;
}

export const isParticipant = (row: ConversationRow, userId: string) =>
  row.buyer_id === userId || row.seller_id === userId;

export const counterpartOf = (row: ConversationRow, userId: string) =>
  row.buyer_id === userId ? row.seller_id : row.buyer_id;

export function toMessage(row: MessageRow, viewerId: string): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    fromMe: row.sender_id === viewerId,
    body: row.body,
    sentAt: row.created_at.toISOString(),
  };
}

/** The conversation as one participant sees it. */
export function toConversation(
  row: InboxRow,
  viewerId: string,
  signer: ImgproxySigner,
): Conversation {
  const isBuyer = row.buyer_id === viewerId;
  return {
    id: row.id,
    role: isBuyer ? 'buyer' : 'seller',
    listing: {
      id: row.listing_id,
      title: row.listing_title,
      image: row.listing_image_id ? { thumb: imageUrls(signer, row.listing_image_id).thumb } : null,
    },
    counterpart: {
      id: isBuyer ? row.seller_id : row.buyer_id,
      name: isBuyer ? row.seller_name : row.buyer_name,
    },
    lastMessage:
      row.last_body !== null && row.last_sent_at !== null
        ? {
            body: row.last_body,
            fromMe: row.last_sender_id === viewerId,
            sentAt: row.last_sent_at.toISOString(),
          }
        : null,
    unread: Number(row.unread),
    createdAt: row.created_at.toISOString(),
    lastMessageAt: row.last_message_at.toISOString(),
  };
}
