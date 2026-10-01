import { Badge, Button } from '@raadi/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { myListings } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('my');
  return { title: t('title'), robots: { index: false } };
}

export default async function MyListingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session.authenticated) {
    redirect(
      `/auth/login?returnTo=${encodeURIComponent(`/${locale}/my/listings`)}&locale=${locale}`,
    );
  }
  const [t, page, current] = await Promise.all([getTranslations(), myListings(), getLocale()]);
  const items = page?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('my.title')}</h1>
        <Button asChild>
          <Link href="/listings/new">{t('nav.newListing')}</Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="space-y-3 py-12 text-center">
          <p className="text-muted-foreground">{t('my.empty')}</p>
          <Button asChild variant="outline">
            <Link href="/listings/new">{t('my.create')}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border" role="list" data-testid="my-listings">
          {items.map((l) => (
            <li key={l.id}>
              <Link
                href={`/listings/${l.id}`}
                className="flex items-center gap-4 p-3 hover:bg-accent"
              >
                {l.images[0] ? (
                  <img
                    src={l.images[0].urls.thumb}
                    alt=""
                    className="h-16 w-20 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-20 rounded bg-muted" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{l.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {l.priceNok === null ? t('listing.noPrice') : formatPrice(l.priceNok, current)}{' '}
                    · {l.location.name}
                  </p>
                </div>
                <Badge variant={l.status === 'sold' ? 'secondary' : 'success'}>
                  {t(`my.status.${l.status === 'sold' ? 'sold' : 'active'}`)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
