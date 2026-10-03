/**
 * Marketplace taxonomy. Keys are stable identifiers (ASCII slugs) used in
 * URLs, events and the search index; display names live in the web app's
 * message catalogues (nb/en/so).
 */
export const CATEGORIES = {
  // Torget follows FINN's main groups. Keys are never renamed (they are stored
  // on listings); new groups are appended.
  torget: [
    'elektronikk',
    'mobler',
    'klaer',
    'sport',
    'barn',
    'hobby',
    'hage',
    'antikviteter',
    'dyr',
    'kjoretoyutstyr',
  ],
  bil: ['personbil', 'varebil', 'motorsykkel', 'bobil'],
  eiendom: ['salg', 'utleie', 'fritid', 'tomt', 'nybygg', 'naering'],
  jobb: [
    'it',
    'helse',
    'bygg',
    'undervisning',
    'handel',
    'transport',
    'kontor',
    'industri',
    'reiseliv',
  ],
  reise: ['hytteutleie', 'leilighet', 'pakkereise'],
} as const;

export type Category = keyof typeof CATEGORIES;
export type Subcategory = (typeof CATEGORIES)[Category][number];

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function isSubcategoryOf(category: Category, subcategory: string): boolean {
  return (CATEGORIES[category] as readonly string[]).includes(subcategory);
}
