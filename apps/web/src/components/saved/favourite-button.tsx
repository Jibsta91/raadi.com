'use client';

import { cn } from '@raadi/ui';
import { Heart } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Heart toggle for a listing (ADR-0026). Saves at once, optimistically; a signed-out visitor is
 * sent to sign in and comes back here. `overlay` sits on a card's photo, `inline` beside a title.
 */
export function FavouriteButton({
  listingId,
  initial,
  variant = 'overlay',
}: {
  listingId: string;
  initial: boolean;
  variant?: 'overlay' | 'inline';
}) {
  const t = useTranslations('favourites');
  const locale = useLocale();
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    const res = await fetch(`/api/v1/saved/favourites/${listingId}`, {
      method: next ? 'PUT' : 'DELETE',
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 401) {
      const here = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/auth/login?returnTo=${encodeURIComponent(here)}&locale=${locale}`;
      return;
    }
    if (!res?.ok) setSaved(!next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? t('remove') : t('add')}
      title={saved ? t('remove') : t('add')}
      data-testid="favourite-toggle"
      className={cn(
        'flex items-center justify-center rounded-full transition-[transform,background-color] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'overlay'
          ? 'glass absolute right-2.5 top-2.5 z-10 size-9 sm:right-3 sm:top-3'
          : 'size-11 border bg-card hover:bg-accent',
      )}
    >
      <Heart
        aria-hidden
        className={cn('size-[18px]', saved ? 'fill-rose-500 text-rose-500' : 'text-foreground')}
        strokeWidth={2}
      />
    </button>
  );
}
