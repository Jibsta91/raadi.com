'use client';

import { Button } from '@raadi/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Remove the listing (the owner is told; its reports are resolved) or dismiss its reports. */
export function ModerationActions({ listingId, removed }: { listingId: string; removed: boolean }) {
  const t = useTranslations('moderation');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(kind: 'remove' | 'dismiss') {
    if (kind === 'remove' && !window.confirm(t('confirmRemove'))) return;
    setBusy(true);
    const res = await fetch(
      kind === 'remove'
        ? `/api/v1/listings/${listingId}`
        : `/api/v1/listings/moderation/reports/${listingId}/dismiss`,
      { method: kind === 'remove' ? 'DELETE' : 'POST' },
    ).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {removed ? null : (
        <Button
          size="sm"
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disabled={busy}
          onClick={() => void act('remove')}
          data-testid="moderation-remove"
        >
          {t('remove')}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void act('dismiss')}
        data-testid="moderation-dismiss"
      >
        {t('dismiss')}
      </Button>
    </div>
  );
}
