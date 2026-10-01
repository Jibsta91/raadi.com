import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function Footer() {
  const t = await getTranslations('footer');
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <span>{t('tagline')}</span>
        <nav className="flex gap-4">
          <Link href="/privacy" className="hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/status" className="hover:underline">
            {t('status')}
          </Link>
          <span>{t('openSource')}</span>
        </nav>
      </div>
    </footer>
  );
}
