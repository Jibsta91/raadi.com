import { COUNTIES, type County } from '@raadi/catalog';
import type { SearchQuery } from '@raadi/api-client';
import { Button } from '@raadi/ui';
import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ListingCard } from '@/components/listings/listing-card';
import { FacetGroup } from '@/components/search/facet-group';
import { SearchControls } from '@/components/search/search-controls';
import { Link } from '@/i18n/navigation';
import { searchListings, ServiceUnavailableError } from '@/lib/api';
import { flatParams } from '@/lib/format';
import { href, type Params, withParams } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

const PASSTHROUGH = [
  'q',
  'category',
  'subcategory',
  'county',
  'condition',
  'fuel',
  'propertyType',
  'employmentType',
  'priceMin',
  'priceMax',
  'near',
  'lat',
  'lon',
  'radiusKm',
  'sort',
  'page',
] as const;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const t = await getTranslations('search');
  const { q } = flatParams(await searchParams);
  return { title: q ? `${q} – ${t('title')}` : t('title') };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const all = flatParams(await searchParams);
  const current: Params = Object.fromEntries(
    Object.entries(all).filter(([k]) => (PASSTHROUGH as readonly string[]).includes(k)),
  );

  let result;
  try {
    result = await searchListings({ ...current, pageSize: 24 } as unknown as SearchQuery);
  } catch (error) {
    if (!(error instanceof ServiceUnavailableError)) throw error;
    return (
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
        {t('search.unavailable')}
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(Math.min(result.total, 200 * 24) / result.pageSize));
  const label = (facet: string) => (value: string) => {
    switch (facet) {
      case 'category':
        return t(`taxonomy.categories.${value}` as never);
      case 'subcategory':
        return t(`taxonomy.subcategories.${value}` as never);
      case 'county':
        return COUNTIES[value as County] ?? value;
      default:
        return t(`taxonomy.values.${facet}.${value}` as never);
    }
  };
  const filtered = Object.keys(current).some((k) => k !== 'q' && k !== 'sort' && k !== 'page');

  return (
    <div className="space-y-6">
      <form action={`/${locale}/search`} method="get" role="search" className="flex gap-2">
        {Object.entries(current)
          .filter(([k]) => k !== 'q' && k !== 'page')
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label className="sr-only" htmlFor="q">
          {t('search.placeholder')}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={current.q ?? ''}
          placeholder={t('search.placeholder')}
          data-testid="search-input"
          className="h-12 flex-1 rounded-full border border-input bg-card px-5 text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          maxLength={200}
        />
        <Button type="submit" size="lg" data-testid="search-submit">
          {t('search.submit')}
        </Button>
      </form>

      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <aside aria-label={t('search.filters')} className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t('search.filters')}</h2>
            {filtered ? (
              <Link
                href={href(current.q ? { q: current.q } : {})}
                className="text-sm text-primary hover:underline"
              >
                {t('search.clearFilters')}
              </Link>
            ) : null}
          </div>
          {(
            [
              'category',
              'subcategory',
              'county',
              'condition',
              'fuel',
              'propertyType',
              'employmentType',
            ] as const
          ).map((facet) => (
            <FacetGroup
              key={facet}
              name={facet}
              title={t(`search.facets.${facet}`)}
              values={result.facets[facet]}
              params={current}
              label={label(facet)}
            />
          ))}
          <form
            action={`/${locale}/search`}
            method="get"
            className="space-y-2"
            data-testid="price-filter"
          >
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('search.price')}</legend>
              {Object.entries(current)
                .filter(([k]) => !['priceMin', 'priceMax', 'page'].includes(k))
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <div className="flex gap-2">
                <input
                  name="priceMin"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={t('search.priceMin')}
                  placeholder={t('search.priceMin')}
                  defaultValue={current.priceMin}
                  className="h-10 w-full field border-input px-3 text-sm"
                />
                <input
                  name="priceMax"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={t('search.priceMax')}
                  placeholder={t('search.priceMax')}
                  defaultValue={current.priceMax}
                  className="h-10 w-full field border-input px-3 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="mt-2 w-full">
                {t('search.apply')}
              </Button>
            </fieldset>
          </form>
        </aside>

        <section aria-labelledby="results-heading" className="space-y-4">
          <SearchControls params={current} />
          <h1 id="results-heading" className="text-xl font-semibold" data-testid="result-count">
            {t('search.results', { total: result.total })}
          </h1>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <SearchX aria-hidden className="size-10" />
              <p className="font-medium text-foreground">{t('search.noResults')}</p>
              <p>{t('search.noResultsHint')}</p>
            </div>
          ) : (
            <ul
              className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-6 sm:gap-y-8 xl:grid-cols-3"
              role="list"
            >
              {result.items.map((hit) => (
                <li key={hit.id} className="flex">
                  <ListingCard hit={hit} />
                </li>
              ))}
            </ul>
          )}
          {pages > 1 ? (
            <nav
              aria-label={t('search.pageOf', { page: result.page, pages })}
              className="flex items-center justify-between pt-4"
            >
              {result.page > 1 ? (
                <Link
                  href={href({
                    ...withParams(current, {}),
                    ...(result.page > 2 ? { page: String(result.page - 1) } : {}),
                  })}
                  rel="prev"
                  className="text-primary hover:underline"
                >
                  ← {t('search.previous')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-muted-foreground">
                {t('search.pageOf', { page: result.page, pages })}
              </span>
              {result.page < pages ? (
                <Link
                  href={href({ ...withParams(current, {}), page: String(result.page + 1) })}
                  rel="next"
                  className="text-primary hover:underline"
                  data-testid="next-page"
                >
                  {t('search.next')} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
