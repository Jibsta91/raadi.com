import { Button } from '@raadi/ui';
import { Plus, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';

export async function Header({ locale }: { locale: string }) {
  const [t, session] = await Promise.all([getTranslations('nav'), getSession()]);
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(`/${locale}/account`)}&locale=${locale}`;

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="text-2xl font-extrabold tracking-tight text-primary"
          aria-label="Raadi"
        >
          raadi
        </Link>
        <nav className="flex items-center gap-2" aria-label={t('main')}>
          <Button asChild variant="ghost" size="sm">
            <Link href="/search" data-testid="nav-search">
              <Search aria-hidden />
              <span className="hidden sm:inline">{t('search')}</span>
            </Link>
          </Button>
          <LocaleSwitcher label={t('language')} />
          <Button asChild size="sm">
            <Link href="/listings/new" data-testid="nav-new-listing">
              <Plus aria-hidden />
              <span className="hidden sm:inline">{t('newListing')}</span>
            </Link>
          </Button>
          {session.authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/my/listings" data-testid="nav-my-listings">
                  {t('myListings')}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/account" data-testid="nav-account">
                  {session.user.name ?? session.user.email}
                </Link>
              </Button>
              <form action="/auth/logout" method="post">
                <Button type="submit" variant="outline" size="sm" data-testid="nav-logout">
                  {t('logout')}
                </Button>
              </form>
            </>
          ) : (
            <Button asChild variant="outline" size="sm">
              <a href={loginHref} data-testid="nav-login">
                {t('login')}
              </a>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
