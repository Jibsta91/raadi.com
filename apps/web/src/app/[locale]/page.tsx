import { Card, CardDescription, CardHeader, CardTitle } from '@raadi/ui';
import {
  Briefcase,
  Car,
  House,
  Lock,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthErrorBanner } from '@/components/auth-error-banner';
import { ListingCard } from '@/components/listings/listing-card';
import { Link } from '@/i18n/navigation';
import { searchListings } from '@/lib/api';
import { logger } from '@/lib/logger';

const CATEGORIES = [
  { key: 'torget', Icon: ShoppingBag },
  { key: 'bil', Icon: Car },
  { key: 'eiendom', Icon: House },
  { key: 'jobb', Icon: Briefcase },
  { key: 'reise', Icon: Plane },
] as const;

const TRUST = [
  { key: 'verified', Icon: ShieldCheck },
  { key: 'ai', Icon: Sparkles },
  { key: 'privacy', Icon: Lock },
] as const;

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ authError?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { authError } = await searchParams;
  const t = await getTranslations('home');
  // The front page still renders if search is down; it just omits the latest listings.
  const latest = await searchListings({ sort: 'newest', pageSize: 8 }).catch((error: unknown) => {
    logger.warn({ err: error }, 'latest listings unavailable');
    return null;
  });

  return (
    <div className="space-y-16">
      {authError ? <AuthErrorBanner code={authError} /> : null}

      <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 px-8 py-16 text-primary-foreground">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-lg opacity-90">{t('heroSubtitle')}</p>
        <form
          action={`/${locale}/search`}
          method="get"
          role="search"
          className="mt-8 flex max-w-2xl gap-2"
        >
          <label htmlFor="home-q" className="sr-only">
            {t('searchPlaceholder')}
          </label>
          <input
            id="home-q"
            name="q"
            type="search"
            placeholder={t('searchPlaceholder')}
            data-testid="home-search-input"
            className="h-12 flex-1 rounded-md border-0 bg-background px-4 text-foreground"
          />
          <button
            type="submit"
            className="h-12 rounded-md bg-foreground px-6 font-semibold text-background"
          >
            {t('searchSubmit')}
          </button>
        </form>
      </section>

      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-6 text-2xl font-semibold">
          {t('categoriesTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map(({ key, Icon }) => (
            <Link
              key={key}
              href={`/search?category=${key}`}
              className="rounded-lg transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card data-testid={`category-${key}`} className="h-full">
                <CardHeader>
                  <Icon aria-hidden className="mb-2 size-8 text-primary" />
                  <CardTitle>{t(`categories.${key}.name`)}</CardTitle>
                  <CardDescription>{t(`categories.${key}.description`)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {latest?.items.length ? (
        <section aria-labelledby="latest" className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 id="latest" className="text-2xl font-semibold">
              {t('latestTitle')}
            </h2>
            <Link href="/search?sort=newest" className="text-sm text-primary hover:underline">
              {t('seeAll')}
            </Link>
          </div>
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            role="list"
            data-testid="latest-listings"
          >
            {latest.items.map((hit) => (
              <li key={hit.id} className="flex">
                <ListingCard hit={hit} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="trust" className="grid gap-6 md:grid-cols-3">
        <h2 id="trust" className="sr-only">
          {t('trustTitle')}
        </h2>
        {TRUST.map(({ key, Icon }) => (
          <div key={key} className="flex gap-4">
            <Icon aria-hidden className="size-6 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold">{t(`trust.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`trust.${key}.body`)}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
