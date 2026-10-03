import { z } from 'zod';
import { CATEGORY_KEYS, type Category } from './categories.js';

export * from './categories.js';

export const categorySchema = z.enum(CATEGORY_KEYS as [Category, ...Category[]]);

export const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
export const FUELS = ['petrol', 'diesel', 'electric', 'hybrid'] as const;
export const GEARBOXES = ['manual', 'automatic'] as const;
export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'townhouse',
  'cabin',
  'plot',
  'commercial',
] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'temporary', 'internship'] as const;
export const BODY_TYPES = [
  'sedan',
  'station_wagon',
  'hatchback',
  'suv',
  'coupe',
  'convertible',
  'mpv',
  'pickup',
] as const;
export const DRIVETRAINS = ['fwd', 'rwd', 'awd'] as const;
export const OWNERSHIPS = ['freehold', 'cooperative', 'shares'] as const;

const year = z
  .number()
  .int()
  .min(1900)
  .max(new Date().getUTCFullYear() + 1);

/** Category-specific attributes. Unknown keys are rejected (strict). */
export const attributeSchemas = {
  torget: z.object({ condition: z.enum(CONDITIONS) }).strict(),
  bil: z
    .object({
      make: z.string().trim().min(1).max(40),
      model: z.string().trim().min(1).max(60),
      year,
      mileageKm: z.number().int().min(0).max(2_000_000),
      fuel: z.enum(FUELS),
      gearbox: z.enum(GEARBOXES),
      bodyType: z.enum(BODY_TYPES).optional(),
      drivetrain: z.enum(DRIVETRAINS).optional(),
    })
    .strict(),
  eiendom: z
    .object({
      propertyType: z.enum(PROPERTY_TYPES),
      areaM2: z.number().int().min(1).max(100_000),
      bedrooms: z.number().int().min(0).max(50).optional(),
      ownership: z.enum(OWNERSHIPS).optional(),
    })
    .strict(),
  jobb: z
    .object({
      employer: z.string().trim().min(1).max(80),
      employmentType: z.enum(EMPLOYMENT_TYPES),
    })
    .strict(),
  reise: z.object({ guests: z.number().int().min(1).max(50) }).strict(),
} satisfies Record<Category, z.ZodType>;

export type Attributes = { [C in Category]: z.infer<(typeof attributeSchemas)[C]> };

/** Jobs have no asking price; every other category requires one (NOK, whole kroner). */
export const priceRequired = (category: Category): boolean => category !== 'jobb';

/** Attribute keys exposed as search facets, per category. */
export const FACET_ATTRIBUTES = {
  torget: ['condition'],
  bil: ['make', 'fuel', 'gearbox', 'bodyType', 'drivetrain'],
  eiendom: ['propertyType', 'ownership'],
  jobb: ['employmentType'],
  reise: [],
} as const satisfies Record<Category, readonly string[]>;

export type FacetAttribute = (typeof FACET_ATTRIBUTES)[Category][number];

/**
 * Numeric attributes searchable as a range, per category. Each becomes the
 * query parameters `<param>Min` and `<param>Max` (FINN-style "fra – til").
 */
export const RANGE_ATTRIBUTES = {
  torget: [],
  bil: [
    { param: 'year', field: 'year' },
    { param: 'mileage', field: 'mileageKm' },
  ],
  eiendom: [
    { param: 'area', field: 'areaM2' },
    { param: 'bedrooms', field: 'bedrooms' },
  ],
  jobb: [],
  reise: [{ param: 'guests', field: 'guests' }],
} as const satisfies Record<Category, ReadonlyArray<{ param: string; field: string }>>;

export type RangeParam = (typeof RANGE_ATTRIBUTES)[Category][number]['param'];
export const RANGE_PARAMS = [
  ...new Set(Object.values(RANGE_ATTRIBUTES).flatMap((r) => r.map((a) => a.param))),
] as RangeParam[];
