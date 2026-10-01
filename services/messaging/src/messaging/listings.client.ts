import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { circuitBreaker, retry } from '@raadi/service-kit';
import { z } from 'zod';

const contactSchema = z.object({
  listingId: z.uuid(),
  ownerId: z.uuid(),
  sellerName: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  status: z.enum(['active', 'sold']),
  imageId: z.uuid().nullable(),
});
export type ListingContact = z.infer<typeof contactSchema>;

class NotFound extends Error {}

/**
 * Reads who to contact about a listing from the listings service's internal
 * API, forwarding the user's token (zero trust: listings checks it too).
 */
export class ListingsClient {
  private readonly breaker;

  constructor(private readonly baseUrl: string) {
    this.breaker = circuitBreaker(
      (listingId: string, token: string) =>
        retry(
          async () => {
            const res = await fetch(`${this.baseUrl}/internal/v1/listings/${listingId}/contact`, {
              headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
              signal: AbortSignal.timeout(3000),
            });
            if (res.status === 404) throw new NotFound();
            if (!res.ok) throw new Error(`listings returned ${res.status}`);
            return contactSchema.parse(await res.json());
          },
          { retries: 2, baseDelayMs: 200, shouldRetry: (e) => !(e instanceof NotFound) },
        ),
      // A missing listing is the caller's problem; it must not open the circuit.
      { name: 'listings', timeoutMs: 10_000, errorFilter: (e) => e instanceof NotFound },
    );
  }

  async contact(listingId: string, token: string): Promise<ListingContact> {
    try {
      return await this.breaker.fire(listingId, token);
    } catch (error) {
      if (error instanceof NotFound) throw new NotFoundException('Listing not found');
      throw new ServiceUnavailableException('Listings are temporarily unavailable; please retry.');
    }
  }
}
