import type { Category } from './categories.js';

/*
 * Attribute values and the form fields per category, without zod: the app imports this module
 * (@raadi/catalog/attributes) to build the same listing form as the website. The validation
 * schemas (attributeSchemas in taxonomy.ts) are built from the same lists.
 */

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

export type AttributeField =
  | { key: string; kind: 'select'; options: readonly string[]; required: boolean }
  | { key: string; kind: 'text'; required: boolean; maxLength: number }
  | {
      key: string;
      kind: 'number';
      required: boolean;
      min?: number;
      max?: number;
      /** Shown next to the input (km, m²). */
      unit?: string;
    };

/** The attribute inputs per category, in form order (mirrors attributeSchemas). */
export const ATTRIBUTE_FIELDS: Record<Category, AttributeField[]> = {
  torget: [{ key: 'condition', kind: 'select', options: CONDITIONS, required: true }],
  bil: [
    { key: 'make', kind: 'text', required: true, maxLength: 40 },
    { key: 'model', kind: 'text', required: true, maxLength: 60 },
    { key: 'year', kind: 'number', required: true, min: 1900, max: new Date().getFullYear() + 1 },
    { key: 'mileageKm', kind: 'number', required: true, min: 0, unit: 'km' },
    { key: 'fuel', kind: 'select', options: FUELS, required: true },
    { key: 'gearbox', kind: 'select', options: GEARBOXES, required: true },
    { key: 'bodyType', kind: 'select', options: BODY_TYPES, required: false },
    { key: 'drivetrain', kind: 'select', options: DRIVETRAINS, required: false },
  ],
  eiendom: [
    { key: 'propertyType', kind: 'select', options: PROPERTY_TYPES, required: true },
    { key: 'areaM2', kind: 'number', required: true, min: 1, unit: 'm²' },
    { key: 'bedrooms', kind: 'number', required: false, min: 0 },
    { key: 'ownership', kind: 'select', options: OWNERSHIPS, required: false },
  ],
  jobb: [
    { key: 'employer', kind: 'text', required: true, maxLength: 80 },
    { key: 'employmentType', kind: 'select', options: EMPLOYMENT_TYPES, required: true },
  ],
  reise: [{ key: 'guests', kind: 'number', required: true, min: 1, max: 50 }],
};

/**
 * Form values (strings) to the API's attributes: empty fields left out, numbers converted.
 * Validation stays on the server (attributeSchemas); this only shapes the payload.
 */
export function attributePayload(
  category: Category,
  values: Record<string, string>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of ATTRIBUTE_FIELDS[category]) {
    const raw = values[f.key]?.trim() ?? '';
    if (raw === '') continue;
    out[f.key] = f.kind === 'number' ? Number(raw) : raw;
  }
  return out;
}

/** Jobs have no asking price; every other category requires one (NOK, whole kroner). */
export const priceRequired = (category: Category): boolean => category !== 'jobb';
