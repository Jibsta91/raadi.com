import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { sellerTrust } from '@/lib/api';
import { Stars } from './stars';
import { VerifiedBadge } from './verified-badge';

/** Seller's rating and verification on a listing page, linking to their profile. */
export async function SellerTrust({ listingId }: { listingId: string }) {
  const [t, format, trust] = await Promise.all([
    getTranslations('trust'),
    getFormatter(),
    sellerTrust(listingId),
  ]);
  if (!trust) return null;
  const { rating, verification } = trust;
  return (
    <div className="space-y-1" data-testid="seller-trust">
      {rating.count > 0 && rating.average !== null ? (
        <Link
          href={`/users/${trust.userId}`}
          className="flex items-center gap-2 hover:underline"
          data-testid="seller-rating"
        >
          <Stars
            value={rating.average}
            label={t('outOf5', { value: format.number(rating.average) })}
          />
          <span>
            {format.number(rating.average, { minimumFractionDigits: 1 })} ·{' '}
            {t('reviewCount', { count: rating.count })}
          </span>
        </Link>
      ) : (
        <Link href={`/users/${trust.userId}`} className="text-muted-foreground hover:underline">
          {t('noReviewsYet')}
        </Link>
      )}
      {verification ? <VerifiedBadge label={t('verified')} /> : null}
    </div>
  );
}
