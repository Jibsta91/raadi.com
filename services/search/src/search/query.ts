import {
  BODY_TYPES,
  CATEGORY_KEYS,
  CONDITIONS,
  COUNTIES,
  DRIVETRAINS,
  EMPLOYMENT_TYPES,
  FUELS,
  GEARBOXES,
  OWNERSHIPS,
  PROPERTY_TYPES,
  RANGE_ATTRIBUTES,
  RANGE_PARAMS,
  type RangeParam,
  findPlace,
} from '@raadi/catalog';
import { z } from 'zod';

const count = z.coerce.number().int().min(0).max(10_000_000);
/** yearMin/yearMax, mileageMin/mileageMax, … for every range attribute in the taxonomy. */
const rangeParams = Object.fromEntries(
  RANGE_PARAMS.flatMap((p) => [
    [`${p}Min`, count.optional()],
    [`${p}Max`, count.optional()],
  ]),
) as Record<`${RangeParam}${'Min' | 'Max'}`, z.ZodOptional<typeof count>>;

/** Index field of each range parameter (the same name in every category that has it). */
const RANGE_FIELDS = Object.fromEntries(
  Object.values(RANGE_ATTRIBUTES).flatMap((r) => r.map((a) => [a.param, `attributes.${a.field}`])),
) as Record<RangeParam, string>;

const csv = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values as [T, ...T[]])).max(values.length));

/** Query string of GET /api/v1/search/listings. Multi-value facets are comma-separated. */
export const searchParamsSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: csv(CATEGORY_KEYS).optional(),
    subcategory: z
      .string()
      .trim()
      .max(400)
      .transform((s) => s.split(',').filter(Boolean))
      .optional(),
    county: csv(Object.keys(COUNTIES)).optional(),
    condition: csv(CONDITIONS).optional(),
    fuel: csv(FUELS).optional(),
    propertyType: csv(PROPERTY_TYPES).optional(),
    employmentType: csv(EMPLOYMENT_TYPES).optional(),
    gearbox: csv(GEARBOXES).optional(),
    bodyType: csv(BODY_TYPES).optional(),
    drivetrain: csv(DRIVETRAINS).optional(),
    ownership: csv(OWNERSHIPS).optional(),
    /** Car makes, matched case-insensitively (the index lower-cases them). */
    make: z
      .string()
      .trim()
      .max(400)
      .transform((s) =>
        s
          .split(',')
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(40)).max(20))
      .optional(),
    ...rangeParams,
    priceMin: z.coerce.number().int().min(0).optional(),
    priceMax: z.coerce.number().int().min(0).optional(),
    /** Centre of a radius search: a place id from the gazetteer, or lat+lon (e.g. the browser's position). */
    near: z.string().max(40).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(2000).optional(),
    sort: z
      .enum(['relevance', 'newest', 'price_asc', 'price_desc', 'distance'])
      .default('relevance'),
    page: z.coerce.number().int().min(1).max(200).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.near && !findPlace(p.near))
      ctx.addIssue({ code: 'custom', path: ['near'], message: 'unknown place' });
    if ((p.lat === undefined) !== (p.lon === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['lat'], message: 'lat and lon go together' });
    }
    for (const name of ['price', ...RANGE_PARAMS] as const) {
      const min = p[`${name}Min`];
      const max = p[`${name}Max`];
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({
          code: 'custom',
          path: [`${name}Min`],
          message: `${name}Min is above ${name}Max`,
        });
      }
    }
    if (p.sort === 'distance' && !p.near && p.lat === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'distance sorting needs near or lat/lon',
      });
    }
  });

export type SearchParams = z.infer<typeof searchParamsSchema>;

/** Facets returned with every search, and the document field each counts. */
export const FACETS = {
  category: 'category',
  subcategory: 'subcategory',
  county: 'county',
  condition: 'attributes.condition',
  fuel: 'attributes.fuel',
  propertyType: 'attributes.propertyType',
  employmentType: 'attributes.employmentType',
  gearbox: 'attributes.gearbox',
  bodyType: 'attributes.bodyType',
  drivetrain: 'attributes.drivetrain',
  ownership: 'attributes.ownership',
  make: 'attributes.make',
} as const;
type Facet = keyof typeof FACETS;

export const PRICE_RANGES = [
  { key: '0-999', to: 1000 },
  { key: '1000-9999', from: 1000, to: 10_000 },
  { key: '10000-99999', from: 10_000, to: 100_000 },
  { key: '100000-999999', from: 100_000, to: 1_000_000 },
  { key: '1000000+', from: 1_000_000 },
] as const;

export function centre(p: SearchParams): { lat: number; lon: number } | undefined {
  if (p.lat !== undefined && p.lon !== undefined) return { lat: p.lat, lon: p.lon };
  const place = p.near ? findPlace(p.near) : undefined;
  return place ? { lat: place.lat, lon: place.lon } : undefined;
}

/**
 * Builds the OpenSearch request. Text, price and geo constraints filter the
 * whole result set. Facet selections are applied as a post_filter, and each
 * facet's aggregation applies every selection except its own, so choosing
 * "bil" still shows the counts for the other categories (standard faceting).
 */
export function buildSearch(p: SearchParams) {
  const must: object[] = [];
  const filter: object[] = [{ term: { status: 'active' } }];

  if (p.q) {
    must.push({
      multi_match: {
        query: p.q,
        fields: ['title^3', 'title.std^2', 'description'],
        type: 'best_fields',
        operator: 'and',
        fuzziness: 'AUTO',
        prefix_length: 1,
      },
    });
  }
  if (p.priceMin !== undefined || p.priceMax !== undefined) {
    filter.push({ range: { priceNok: { gte: p.priceMin, lte: p.priceMax } } });
  }
  for (const name of RANGE_PARAMS) {
    const gte = p[`${name}Min`];
    const lte = p[`${name}Max`];
    if (gte !== undefined || lte !== undefined) {
      filter.push({ range: { [RANGE_FIELDS[name]]: { gte, lte } } });
    }
  }
  const c = centre(p);
  if (c) filter.push({ geo_distance: { distance: `${p.radiusKm ?? 50}km`, location: c } });

  const selections: Partial<Record<Facet, object>> = {};
  for (const facet of Object.keys(FACETS) as Facet[]) {
    const values = p[facet];
    if (values?.length) selections[facet] = { terms: { [FACETS[facet]]: values } };
  }
  const others = (except?: Facet) =>
    Object.entries(selections)
      .filter(([f]) => f !== except)
      .map(([, clause]) => clause);

  const aggs: Record<string, object> = {};
  for (const facet of Object.keys(FACETS) as Facet[]) {
    aggs[facet] = {
      filter: { bool: { filter: others(facet) } },
      aggs: { values: { terms: { field: FACETS[facet], size: 50 } } },
    };
  }
  aggs.price = {
    filter: { bool: { filter: others() } },
    aggs: { values: { range: { field: 'priceNok', ranges: PRICE_RANGES } } },
  };

  const sort: Array<string | object> = [];
  switch (p.sort) {
    case 'newest':
      sort.push({ publishedAt: 'desc' });
      break;
    case 'price_asc':
      sort.push({ priceNok: { order: 'asc', missing: '_last' } });
      break;
    case 'price_desc':
      sort.push({ priceNok: { order: 'desc', missing: '_last' } });
      break;
    case 'distance':
      sort.push({ _geo_distance: { location: c, order: 'asc', unit: 'km' } });
      break;
    default:
      sort.push('_score', { publishedAt: 'desc' });
  }
  // Distance is shown on every hit when a centre is known, whatever the sort.
  const scriptFields = c
    ? {
        distance_km: {
          script: {
            source: "doc['location'].arcDistance(params.lat, params.lon) / 1000",
            params: c,
          },
        },
      }
    : undefined;

  return {
    from: (p.page - 1) * p.pageSize,
    size: p.pageSize,
    track_total_hits: true,
    query: {
      bool: {
        must: must.length ? must : [{ match_all: {} }],
        filter,
        // Running paid promotions rank first under "relevance" (ADR-0020). An
        // optional clause: it changes the order, never which listings match.
        // Explicit sorts (newest, price, distance) stay neutral.
        ...(p.sort === 'relevance'
          ? {
              should: [
                {
                  constant_score: {
                    filter: { range: { promotedUntil: { gt: 'now' } } },
                    boost: 1000,
                  },
                },
              ],
            }
          : {}),
      },
    },
    post_filter: { bool: { filter: others() } },
    aggs,
    sort,
    _source: { excludes: ['description', 'ownerId'] },
    ...(scriptFields ? { script_fields: scriptFields } : {}),
  };
}
