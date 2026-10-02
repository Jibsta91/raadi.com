import { Inject, Injectable } from '@nestjs/common';
import { metrics, trace } from '@opentelemetry/api';
import { COUNTIES, type County } from '@raadi/catalog';
import { parseEvent } from '@raadi/events';
import { imageUrls, type ImgproxySigner } from '@raadi/service-kit';
import { PermanentEventError, type ReceivedEvent } from '@raadi/service-kit/kafka';
import { buildSearch, centre, FACETS, PRICE_RANGES, type SearchParams } from './query.js';
import { SearchIndex, toDocument } from './search.index.js';

export const SIGNER = Symbol('IMGPROXY_SIGNER');

const meter = metrics.getMeter('search');
const indexed = meter.createCounter('raadi.search.indexed', {
  description: 'Index operations from listing events, by outcome (indexed, deleted, stale)',
});
const freshness = meter.createHistogram('raadi.search.index.lag', {
  description: 'Time from the listing change to it being searchable',
  unit: 's',
});
const queries = meter.createHistogram('raadi.search.query.duration', {
  description: 'OpenSearch time per search request',
  unit: 's',
});

export interface SearchHit {
  id: string;
  title: string;
  priceNok: number | null;
  category: string;
  subcategory: string;
  location: {
    placeId: string;
    name: string;
    county: string;
    countyName: string;
    lat: number;
    lon: number;
  };
  distanceKm?: number;
  image?: { thumb: string; card: string };
  imageCount: number;
  attributes: Record<string, string | number | boolean>;
  publishedAt: string;
  promoted: boolean;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  items: SearchHit[];
  facets: Record<keyof typeof FACETS, FacetValue[]> & {
    price: Array<{ key: string; from?: number; to?: number; count: number }>;
  };
}

@Injectable()
export class SearchService {
  constructor(
    private readonly index: SearchIndex,
    @Inject(SIGNER) private readonly signer: ImgproxySigner,
  ) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const span = trace.getActiveSpan();
    span?.setAttributes({
      'raadi.search.has_query': Boolean(params.q),
      'raadi.search.sort': params.sort,
    });
    const res = await this.index.search(buildSearch(params));
    queries.record(res.took / 1000, { sort: params.sort, text: params.q ? 'yes' : 'no' });
    const geo = centre(params);

    const facets = Object.fromEntries(
      Object.keys(FACETS).map((facet) => [
        facet,
        (res.aggregations[facet]?.values.buckets ?? []).map((b) => ({
          value: b.key,
          count: b.doc_count,
        })),
      ]),
    ) as unknown as SearchResult['facets'];
    facets.price = (res.aggregations.price?.values.buckets ?? []).map((b, i) => ({
      key: PRICE_RANGES[i]?.key ?? b.key,
      ...(b.from !== undefined ? { from: b.from } : {}),
      ...(b.to !== undefined ? { to: b.to } : {}),
      count: b.doc_count,
    }));

    return {
      total: res.hits.total.value,
      page: params.page,
      pageSize: params.pageSize,
      items: res.hits.hits.map((h) => {
        const s = h._source;
        const first = s.imageIds[0];
        const distance = h.fields?.distance_km?.[0];
        return {
          id: s.id,
          title: s.title,
          priceNok: s.priceNok,
          category: s.category,
          subcategory: s.subcategory,
          location: {
            placeId: s.placeId,
            name: s.placeName,
            county: s.county,
            countyName: COUNTIES[s.county as County] ?? s.county,
            lat: s.location.lat,
            lon: s.location.lon,
          },
          ...(geo && distance !== undefined ? { distanceKm: Math.round(distance * 10) / 10 } : {}),
          ...(first
            ? { image: (({ thumb, card }) => ({ thumb, card }))(imageUrls(this.signer, first)) }
            : {}),
          imageCount: s.imageIds.length,
          attributes: s.attributes,
          publishedAt: s.publishedAt,
          promoted: !!s.promotedUntil && Date.parse(s.promotedUntil) > Date.now(),
        };
      }),
      facets,
    };
  }

  /** Title suggestions for search-as-you-type. */
  async suggest(q: string): Promise<string[]> {
    const res = await this.index.search({
      size: 0,
      query: {
        bool: {
          must: [{ match: { 'title.prefix': { query: q, operator: 'and' } } }],
          filter: [{ term: { status: 'active' } }],
        },
      },
      aggs: { titles: { terms: { field: 'title.raw', size: 8 } } },
    });
    const buckets = (res.aggregations as unknown as { titles: { buckets: Array<{ key: string }> } })
      .titles.buckets;
    return buckets.map((b) => b.key);
  }

  /** Kafka handler for raadi.listing.events (idempotent via external versions). */
  async onListingEvent(event: ReceivedEvent): Promise<void> {
    let parsed;
    try {
      parsed = parseEvent(event.value);
    } catch (error) {
      throw new PermanentEventError('listing event violates its contract', { cause: error });
    }
    if (!parsed) return;
    let outcome: string;
    switch (parsed.type) {
      case 'no.raadi.listings.listing.published.v1':
      case 'no.raadi.listings.listing.updated.v1': {
        const { listing } = parsed.data;
        outcome =
          listing.status === 'deleted'
            ? await this.index.remove(listing.id, listing.version)
            : await this.index.upsert(toDocument(listing), listing.version);
        break;
      }
      case 'no.raadi.listings.listing.deleted.v1':
        outcome = await this.index.remove(parsed.data.listingId, parsed.data.version);
        break;
      default:
        return;
    }
    indexed.add(1, { outcome, type: parsed.type });
    freshness.record((Date.now() - Date.parse(parsed.time)) / 1000);
  }
}
