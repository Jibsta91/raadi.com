// Top-level categories (ids from @raadi/catalog's taxonomy); names live in the i18n catalogue.
export const CATEGORIES = ['torget', 'bil', 'eiendom', 'jobb', 'reise'] as const;
export type CategoryId = (typeof CATEGORIES)[number];

export function isCategory(value: string | undefined): value is CategoryId {
  return (CATEGORIES as readonly string[]).includes(value ?? '');
}
