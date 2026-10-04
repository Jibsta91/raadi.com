import type { Place } from '@raadi/catalog/places';

/** Lower-case and fold Norwegian letters, so "tromso" finds "Tromsø" and "aalesund" finds "Ålesund". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/å/g, 'aa')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Places whose name starts with (then contains) the query, best matches first. */
export function searchPlaces(places: readonly Place[], query: string, limit = 8): Place[] {
  const q = fold(query.trim());
  if (!q) return [];
  const starts: Place[] = [];
  const contains: Place[] = [];
  for (const p of places) {
    const name = fold(p.name);
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q)) contains.push(p);
  }
  const byName = (a: Place, b: Place) => a.name.localeCompare(b.name, 'nb');
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}
