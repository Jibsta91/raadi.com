const nok = new Map<string, Intl.NumberFormat>();

/** "1 350 kr" (nb) / "NOK 1,350" (en): whole kroner, locale-aware grouping. */
export function formatPrice(value: number, locale: string): string {
  const key = locale === 'nb' ? 'nb-NO' : locale === 'so' ? 'so-SO' : 'en-GB';
  if (!nok.has(key)) {
    nok.set(
      key,
      new Intl.NumberFormat(key, { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }),
    );
  }
  return nok.get(key)!.format(value);
}

/** Search params as a flat record (Next.js gives string | string[] | undefined). */
export function flatParams(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v] as const)
      .filter((e): e is readonly [string, string] => typeof e[1] === 'string' && e[1] !== ''),
  );
}

/** Builds a query string from a record, dropping empty values. */
export function toQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
