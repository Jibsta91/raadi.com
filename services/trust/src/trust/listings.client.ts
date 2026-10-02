import { Logger } from '@nestjs/common';
import { circuitBreaker } from '@raadi/service-kit';
import { z } from 'zod';

const contactSchema = z.object({ ownerId: z.uuid(), sellerName: z.string().min(1).max(80) });

/**
 * Reads a seller's public display name from the listings service's internal
 * API, forwarding the user's token (zero trust: listings checks it too).
 * Events never carry names, so this is how trust learns sellers' names.
 * Best effort: any failure returns null and the review is still published.
 */
export class ListingsClient {
  private readonly logger = new Logger(ListingsClient.name);
  private readonly breaker;

  constructor(private readonly baseUrl: string) {
    this.breaker = circuitBreaker(
      async (listingId: string, token: string) => {
        const res = await fetch(`${this.baseUrl}/internal/v1/listings/${listingId}/contact`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
          signal: AbortSignal.timeout(2000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`listings returned ${res.status}`);
        return contactSchema.parse(await res.json());
      },
      { name: 'listings', timeoutMs: 3000 },
    );
  }

  async seller(listingId: string, token: string): Promise<z.infer<typeof contactSchema> | null> {
    try {
      return await this.breaker.fire(listingId, token);
    } catch (error) {
      this.logger.warn({ err: error, listingId }, 'seller name unavailable');
      return null;
    }
  }
}
