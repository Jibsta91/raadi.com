'use client';

import type { NotificationPreferences } from '@raadi/api-client';
import { Button } from '@raadi/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';

/** "Mark all read" for the notification list. */
export function MarkAllRead() {
  const t = useTranslations('notifications');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid="notifications-read-all"
      onClick={() =>
        start(async () => {
          const res = await fetch('/api/v1/notifications/read-all', { method: 'POST' });
          if (res.ok) router.refresh();
        })
      }
    >
      {t('markAllRead')}
    </Button>
  );
}

/** Marks a notification read, then follows its link (`link` has no locale prefix). */
export function NotificationLink({
  id,
  link,
  href,
  children,
}: {
  id: string;
  link: string;
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      className="block p-3 hover:bg-accent"
      data-testid="notification-item"
      onClick={(e) => {
        e.preventDefault();
        void fetch(`/api/v1/notifications/${id}/read`, { method: 'POST' }).finally(() =>
          router.push(link),
        );
      }}
    >
      {children}
    </a>
  );
}

/** E-mail preference toggle; saved immediately. */
export function EmailPreferences({ initial }: { initial: NotificationPreferences }) {
  const t = useTranslations('notifications.settings');
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function toggle(emailMessages: boolean) {
    setPrefs({ emailMessages });
    setState('saving');
    const res = await fetch('/api/v1/notifications/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emailMessages }),
    }).catch(() => null);
    if (res?.ok) return setState('saved');
    setPrefs({ emailMessages: !emailMessages });
    setState('error');
  }

  return (
    <section aria-labelledby="email-settings" className="space-y-3 rounded-lg border p-4">
      <h2 id="email-settings" className="font-semibold">
        {t('title')}
      </h2>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={prefs.emailMessages}
          disabled={state === 'saving'}
          onChange={(e) => void toggle(e.target.checked)}
          data-testid="pref-email-messages"
        />
        <span>
          <span className="block text-sm font-medium">{t('emailMessages')}</span>
          <span className="block text-xs text-muted-foreground">{t('emailMessagesHint')}</span>
        </span>
      </label>
      <p role="status" className="text-xs text-muted-foreground" data-testid="pref-status">
        {state === 'saved' ? t('saved') : state === 'error' ? t('error') : ''}
      </p>
    </section>
  );
}
