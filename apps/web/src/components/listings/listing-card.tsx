import type { SearchHit } from '@raadi/api-client';
import { ImageOff, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/format';

/** A result tile: image, price, title, place (and distance when searching near a place). */
export async function ListingCard({ hit }: { hit: SearchHit }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <Link
      href={`/listings/${hit.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="listing-card"
    >
      <div className="relative aspect-[4/3] bg-muted">
        {hit.image ? (
          /* Plain <img>: imgproxy already serves sized, signed variants. */
          <img
            src={hit.image.card}
            srcSet={`${hit.image.thumb} 320w, ${hit.image.card} 640w`}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <ImageOff aria-hidden className="absolute inset-0 m-auto size-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-lg font-bold" data-testid="listing-card-price">
          {hit.priceNok === null ? t('listing.noPrice') : formatPrice(hit.priceNok, locale)}
        </p>
        <h3 className="line-clamp-2 text-sm font-medium" data-testid="listing-card-title">
          {hit.title}
        </h3>
        <p
          className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground"
          data-testid="listing-card-location"
        >
          <MapPin aria-hidden className="size-3" />
          {hit.location.name}
          {hit.distanceKm !== undefined
            ? ` · ${t('search.distance', { km: Math.round(hit.distanceKm) })}`
            : ''}
        </p>
      </div>
    </Link>
  );
}

export function ListingGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list">
      {children}
    </ul>
  );
}
