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
} as const;

export type EventType = keyof typeof contracts;
export type EventData<T extends EventType> = z.infer<(typeof contracts)[T]>;
export const EVENT_TYPES = Object.keys(contracts) as EventType[];
