'use client';

import { Button } from '@raadi/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';

/** Starts BankID verification: a full-page navigation through the trust service. */
export function VerifyButton({ locale }: { locale: string }) {
  const t = useTranslations('trust');
  const params = new URLSearchParams({ returnTo: `/${locale}/account`, locale });
  return (
    <Button asChild data-testid="verify-bankid">
      <a href={`/api/v1/trust/verification/start?${params}`}>{t('verifyWithBankId')}</a>
    </Button>
  );
}

export function RemoveVerification() {
  const t = useTranslations('trust');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      data-testid="verification-remove"
      onClick={() => {
        if (!window.confirm(t('removeVerificationConfirm'))) return;
        start(async () => {
          const res = await fetch('/api/v1/trust/verification', { method: 'DELETE' });
          if (res.ok) router.refresh();
        });
      }}
    >
      {t('removeVerification')}
    </Button>
  );
}
