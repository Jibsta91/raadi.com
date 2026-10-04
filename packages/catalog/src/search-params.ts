import { z } from 'zod';
import { COUNTIES, findPlace } from './places.js';
import {
  BODY_TYPES,
  CATEGORY_KEYS,
  CONDITIONS,
  DRIVETRAINS,
  EMPLOYMENT_TYPES,
  FUELS,
  GEARBOXES,
  OWNERSHIPS,
  PROPERTY_TYPES,
  RANGE_PARAMS,
  type RangeParam,
} from './taxonomy.js';

/**
 * The search API's query parameters (GET /api/v1/search/listings), shared by the
 * search service and the services that store searches (saved searches, ADR-0026).
 */
const count = z.coerce.number().int().min(0).max(10_000_000);
/** yearMin/yearMax, mileageMin/mileageMax, … for every range attribute in the taxonomy. */
const rangeParams = Object.fromEntries(
  RANGE_PARAMS.flatMap((p) => [
    [`${p}Min`, count.optional()],
    [`${p}Max`, count.optional()],
  ]),
) as Record<`${RangeParam}${'Min' | 'Max'}`, z.ZodOptional<typeof count>>;

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
    /**
     * Only listings published in this window (exclusive start, inclusive end). Used by saved
     * searches to find new matches (ADR-0026).
     */
    publishedAfter: z.iso.datetime({ offset: true }).optional(),
    publishedBefore: z.iso.datetime({ offset: true }).optional(),
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

/** Parameters that describe what to find (not how to page or sort): what a saved search keeps. */
export const SAVED_SEARCH_EXCLUDED = [
  'page',
  'pageSize',
  'sort',
  'publishedAfter',
  'publishedBefore',
];
