'use client';

import { PLACES } from '@raadi/catalog';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { href, type Params, withParams } from '@/lib/search-params';

const RADII = ['10', '25', '50', '100', '250'];
const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'distance'] as const;
const PLACES_BY_NAME = [...PLACES].sort((a, b) => a.name.localeCompare(b.name, 'nb'));

/** Location (place or the browser's position), radius and sort. */
export function SearchControls({ params }: { params: Params }) {
  const t = useTranslations('search');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (changes: Record<string, string | undefined>) =>
    startTransition(() => router.push(href(withParams(params, changes)), { scroll: false }));
  const hasCentre = Boolean(params.near || params.lat);

  const nearMe = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        go({
          near: undefined,
          lat: pos.coords.latitude.toFixed(3),
          lon: pos.coords.longitude.toFixed(3),
          radiusKm: params.radiusKm ?? '50',
          sort: 'distance',
        }),
      () => undefined,
      { maximumAge: 600_000, timeout: 10_000 },
    );

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('near')}</span>
        <select
          data-testid="filter-near"
          className="h-10 field border-input px-3"
          value={params.near ?? (params.lat ? '__me' : '')}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__me') return nearMe();
            go({
              near: v || undefined,
              lat: undefined,
              lon: undefined,
              radiusKm: v ? (params.radiusKm ?? '50') : undefined,
              sort: !v && params.sort === 'distance' ? undefined : params.sort,
            });
          }}
        >
          <option value="">{t('anywhere')}</option>
          <option value="__me">📍 {t('nearMe')}</option>
          {PLACES_BY_NAME.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {hasCentre ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('radius')}</span>
          <select
            data-testid="filter-radius"
            className="h-10 field border-input px-3"
            value={params.radiusKm ?? '50'}
            onChange={(e) => go({ radiusKm: e.target.value })}
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {t('radiusKm', { km: r })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="ml-auto flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('sortLabel')}</span>
        <select
          data-testid="sort"
          className="h-10 field border-input px-3"
          value={params.sort ?? 'relevance'}
          onChange={(e) =>
            go({ sort: e.target.value === 'relevance' ? undefined : e.target.value })
          }
        >
          {SORTS.filter((s) => s !== 'distance' || hasCentre).map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
