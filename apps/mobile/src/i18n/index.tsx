import { getLocales } from 'expo-localization';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';
import { pickLocale, type Locale } from '../lib/format';
import { catalogues, type Messages } from './messages';

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  m: Messages;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    pickLocale(getLocales().map((l) => l.languageTag)),
  );
  const value = useMemo(() => ({ locale, setLocale, m: catalogues[locale] }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

/** Fills `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
