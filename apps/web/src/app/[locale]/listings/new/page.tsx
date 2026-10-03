import { CATEGORY_KEYS, type Category } from '@raadi/catalog';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ListingForm } from '@/components/listings/listing-form';
import { getSession } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('form');
  return { title: t('newTitle'), robots: { index: false } };
}

export default async function NewListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ locale }, { category }] = await Promise.all([params, searchParams]);
  const initialCategory = (CATEGORY_KEYS as readonly string[]).includes(category ?? '')
    ? (category as Category)
    : undefined;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session.authenticated) {
    redirect(
      `/auth/login?returnTo=${encodeURIComponent(`/${locale}/listings/new${initialCategory ? `?category=${initialCategory}` : ''}`)}&locale=${locale}`,
    );
  }
  const t = await getTranslations('form');
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold">{t('newTitle')}</h1>
      <ListingForm initialCategory={initialCategory} />
    </div>
  );
}
