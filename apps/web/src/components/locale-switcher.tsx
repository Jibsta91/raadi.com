'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

const NAMES: Record<string, string> = { nb: 'Norsk', en: 'English', so: 'Soomaali' };

export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        data-testid="locale-switcher"
        className="h-11 rounded-full border border-input bg-card px-4 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={locale}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => router.replace(pathname, { locale: e.target.value }))
        }
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
