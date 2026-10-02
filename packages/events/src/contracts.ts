import { z } from 'zod';

/**
 * Event data schemas, one per CloudEvents `type`. Events carry ids and public
 * marketplace data, never contact details or other personal data (GDPR).
 * Changing a schema: add optional fields only (BACKWARD compatible, enforced
 * by Apicurio), or publish a new `.v2` type.
 */

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });

export const listingSnapshot = z
  .object({
    id: uuid,
    version: z.number().int().min(1),
    ownerId: uuid,
    status: z.enum(['active', 'sold', 'deleted']),
    category: z.string().min(1),
    subcategory: z.string().min(1),
    title: z.string().min(1).max(120),
    description: z.string().max(5000),
    priceNok: z.number().int().min(0).nullable(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    location: z.object({
      placeId: z.string().min(1),
      name: z.string().min(1),
      county: z.string().min(1),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }),
    imageIds: z.array(uuid).max(10),
    publishedAt: timestamp,
    updatedAt: timestamp,
    /** Added later (optional, BACKWARD compatible): end of a paid promotion, if any (ADR-0020). */
    promotedUntil: timestamp.nullable().optional(),
  })
  .meta({ description: 'Public state of a listing after the change' });

export type ListingSnapshot = z.infer<typeof listingSnapshot>;

export const contracts = {
  'no.raadi.identity.user.registered.v1': z.object({
    userId: uuid,
    locale: z.enum(['nb', 'en', 'so']),
  }),
  'no.raadi.identity.user.preferences_changed.v1': z.object({
    userId: uuid,
    changed: z.array(z.string()),
  }),
  'no.raadi.listings.listing.published.v1': z.object({ listing: listingSnapshot }),
  'no.raadi.listings.listing.updated.v1': z.object({ listing: listingSnapshot }),
  'no.raadi.listings.listing.deleted.v1': z.object({
    listingId: uuid,
    version: z.number().int().min(1),
    imageIds: z.array(uuid),
    /** Added later (optional for BACKWARD compatibility): whose listing, and who removed it. */
    ownerId: uuid.optional(),
    title: z.string().min(1).max(120).optional(),
    reason: z.enum(['owner', 'moderation']).optional(),
  }),
  'no.raadi.media.media.uploaded.v1': z.object({
    mediaId: uuid,
    ownerId: uuid,
    contentType: z.string(),
    bytes: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
  }),
  'no.raadi.media.media.rejected.v1': z.object({
    mediaId: uuid,
    ownerId: uuid,
    reason: z.enum(['malware', 'unsupported_type', 'invalid_image', 'too_large']),
    /** ClamAV signature name when reason is "malware". */
    signature: z.string().optional(),
  }),
  'no.raadi.media.media.deleted.v1': z.object({ mediaId: uuid }),
  /** A message in a buyer-seller conversation. Ids only: the text stays in messaging. */
  'no.raadi.messaging.conversation.message_sent.v1': z.object({
    conversationId: uuid,
    messageId: uuid,
    listingId: uuid,
    senderId: uuid,
    recipientId: uuid,
    sentAt: timestamp,
  }),
  /**
   * A buyer or seller rated the other party after a sale (reviews-trust). Ids
   * and the rating only: the comment stays in the trust service.
   */
  'no.raadi.trust.review.published.v1': z.object({
    reviewId: uuid,
    listingId: uuid,
    reviewerId: uuid,
    subjectId: uuid,
    /** What the subject was in the deal. */
    subjectRole: z.enum(['buyer', 'seller']),
    rating: z.number().int().min(1).max(5),
    publishedAt: timestamp,
  }),
  /** A payment was captured (payments). Amounts in øre; no card or account data. */
  'no.raadi.payments.payment.captured.v1': z.object({
    orderId: uuid,
    userId: uuid,
    listingId: uuid,
    product: z.string().min(1).max(40),
    amountOre: z.number().int().min(1),
    currency: z.literal('NOK'),
    provider: z.enum(['vipps', 'stripe']),
    capturedAt: timestamp,
  }),
  /**
   * The effective end of a listing's paid promotion changed (bought, extended or
   * refunded). Keyed by listing, so events for one listing arrive in order.
   */
  'no.raadi.payments.promotion.changed.v1': z.object({
    listingId: uuid,
    orderId: uuid,
    promotedUntil: timestamp.nullable(),
    reason: z.enum(['purchased', 'refunded']),
  }),
} as const;

export type EventType = keyof typeof contracts;
export type EventData<T extends EventType> = z.infer<(typeof contracts)[T]>;
export const EVENT_TYPES = Object.keys(contracts) as EventType[];
