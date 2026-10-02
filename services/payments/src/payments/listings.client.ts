import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { circuitBreaker, retry } from '@raadi/service-kit';
import { z } from 'zod';

const contactSchema = z.object({
  listingId: z.uuid(),
  ownerId: z.uuid(),
  title: z.string().min(1).max(120),
  status: z.enum(['active', 'sold']),
});
export type ListingFacts = z.infer<typeof contactSchema>;

class NotFound extends Error {}

/**
 * Who owns a listing and whether it is active, from the listings service's
 * internal API with the user's token forwarded (zero trust).
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
      { name: 'listings', timeoutMs: 10_000, errorFilter: (e) => e instanceof NotFound },
    );
  }

  async facts(listingId: string, token: string): Promise<ListingFacts> {
    try {
      return await this.breaker.fire(listingId, token);
    } catch (error) {
      if (error instanceof NotFound) throw new NotFoundException('Listing not found');
      throw new ServiceUnavailableException('Listings are temporarily unavailable; please retry.');
    }
  }
}
