import 'server-only';
import {
  createListingsClient,
  createSearchClient,
  type Listing,
  type ListingPage,
  type SearchQuery,
  type SearchResult,
} from '@raadi/api-client';
import { cache } from 'react';
import { env } from './env';
import { logger } from './logger';
import { accessToken } from './session';

/** Server-side data access: internal service URLs, the user's token when signed in. */

export class ServiceUnavailableError extends Error {}

export async function searchListings(query: SearchQuery): Promise<SearchResult> {
  const client = createSearchClient({ baseUrl: env.searchUrl });
  const { data, error, response } = await client.GET('/api/v1/search/listings', {
    params: { query },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (data) return data;
  if (response.status === 400) {
    logger.info({ query, error }, 'search parameters rejected');
    return { total: 0, page: 1, pageSize: 24, items: [], facets: emptyFacets() };
  }
  logger.warn({ status: response.status, error }, 'search failed');
  throw new ServiceUnavailableError('search unavailable');
}

export const getListing = cache(async (id: string): Promise<Listing | null> => {
  const token = await accessToken().catch(() => null);
  const client = createListingsClient({ baseUrl: env.listingsUrl });
  const { data, response } = await client.GET('/api/v1/listings/{id}', {
    params: { path: { id } },
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (data) return data;
  if (response.status === 404 || response.status === 400) return null;
  throw new ServiceUnavailableError(`listings returned ${response.status}`);
});

export async function myListings(limit = 50, offset = 0): Promise<ListingPage | null> {
  const token = await accessToken();
  if (!token) return null;
  const client = createListingsClient({ baseUrl: env.listingsUrl });
  const { data, response } = await client.GET('/api/v1/listings/mine', {
    params: { query: { limit, offset } },
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (data) return data;
  throw new ServiceUnavailableError(`listings returned ${response.status}`);
}

function emptyFacets(): SearchResult['facets'] {
  return {
    category: [],
    subcategory: [],
    county: [],
    condition: [],
    fuel: [],
    propertyType: [],
    employmentType: [],
    price: [],
  };
}
