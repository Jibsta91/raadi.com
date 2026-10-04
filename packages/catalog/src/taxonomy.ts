import { z } from 'zod';
import {
  BODY_TYPES,
  CONDITIONS,
  DRIVETRAINS,
  EMPLOYMENT_TYPES,
  FUELS,
  GEARBOXES,
  OWNERSHIPS,
  PROPERTY_TYPES,
} from './attributes.js';
import { CATEGORY_KEYS, type Category } from './categories.js';

export * from './attributes.js';
export * from './categories.js';

export const categorySchema = z.enum(CATEGORY_KEYS as [Category, ...Category[]]);

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
