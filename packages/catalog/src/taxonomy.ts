import { z } from 'zod';

/**
 * Marketplace taxonomy. Keys are stable identifiers (ASCII slugs) used in
 * URLs, events and the search index; display names live in the web app's
 * message catalogues (nb/en/so).
 */
export const CATEGORIES = {
  torget: ['elektronikk', 'mobler', 'klaer', 'sport', 'barn', 'hobby'],
  bil: ['personbil', 'varebil', 'motorsykkel', 'bobil'],
  eiendom: ['salg', 'utleie', 'fritid', 'tomt'],
  jobb: ['it', 'helse', 'bygg', 'undervisning', 'handel', 'transport'],
  reise: ['hytteutleie', 'leilighet', 'pakkereise'],
} as const;

export type Category = keyof typeof CATEGORIES;
export type Subcategory = (typeof CATEGORIES)[Category][number];

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
export const categorySchema = z.enum(CATEGORY_KEYS as [Category, ...Category[]]);

export function isSubcategoryOf(category: Category, subcategory: string): boolean {
  return (CATEGORIES[category] as readonly string[]).includes(subcategory);
}

export const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
export const FUELS = ['petrol', 'diesel', 'electric', 'hybrid'] as const;
export const GEARBOXES = ['manual', 'automatic'] as const;
export const PROPERTY_TYPES = ['apartment', 'house', 'townhouse', 'cabin', 'plot'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'temporary', 'internship'] as const;

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
    })
    .strict(),
  eiendom: z
    .object({
      propertyType: z.enum(PROPERTY_TYPES),
      areaM2: z.number().int().min(1).max(100_000),
      bedrooms: z.number().int().min(0).max(50).optional(),
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
export const FACET_ATTRIBUTES: Record<Category, readonly string[]> = {
  torget: ['condition'],
  bil: ['fuel', 'gearbox'],
  eiendom: ['propertyType'],
  jobb: ['employmentType'],
  reise: [],
};
