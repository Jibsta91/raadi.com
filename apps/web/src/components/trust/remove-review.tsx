'use client';

import { Button } from '@raadi/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Withdraw your own review, or remove one as a moderator. */
export function RemoveReview({ id, asModerator }: { id: string; asModerator: boolean }) {
  const t = useTranslations('trust');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      data-testid="review-remove"
      onClick={() => {
        if (!window.confirm(t(asModerator ? 'removeConfirmModerator' : 'removeConfirm'))) return;
        start(async () => {
          const res = await fetch(`/api/v1/trust/reviews/${id}`, { method: 'DELETE' });
          if (res.ok) router.refresh();
        });
      }}
    >
      {t(asModerator ? 'removeModerator' : 'remove')}
    </Button>
  );
}
