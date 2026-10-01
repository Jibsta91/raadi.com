import { Card, CardDescription, CardHeader, CardTitle } from '@raadi/ui';
import {
  Briefcase,
  Car,
  House,
  Lock,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthErrorBanner } from '@/components/auth-error-banner';

const CATEGORIES = [
  { key: 'torget', Icon: ShoppingBag },
  { key: 'bil', Icon: Car },
  { key: 'eiendom', Icon: House },
  { key: 'jobb', Icon: Briefcase },
  { key: 'reise', Icon: Plane },
] as const;

const TRUST = [
  { key: 'verified', Icon: ShieldCheck },
  { key: 'ai', Icon: Sparkles },
  { key: 'privacy', Icon: Lock },
] as const;

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ authError?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { authError } = await searchParams;
  const t = await getTranslations('home');

  return (
    <div className="space-y-16">
      {authError ? <AuthErrorBanner code={authError} /> : null}

      <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 px-8 py-16 text-primary-foreground">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {t('heroTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-lg opacity-90">{t('heroSubtitle')}</p>
      </section>

      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-6 text-2xl font-semibold">
          {t('categoriesTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map(({ key, Icon }) => (
            <Card key={key} data-testid={`category-${key}`}>
              <CardHeader>
                <Icon aria-hidden className="mb-2 size-8 text-primary" />
                <CardTitle>{t(`categories.${key}.name`)}</CardTitle>
                <CardDescription>{t(`categories.${key}.description`)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="trust" className="grid gap-6 md:grid-cols-3">
        <h2 id="trust" className="sr-only">
          {t('trustTitle')}
        </h2>
        {TRUST.map(({ key, Icon }) => (
          <div key={key} className="flex gap-4">
            <Icon aria-hidden className="size-6 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold">{t(`trust.${key}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`trust.${key}.body`)}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
