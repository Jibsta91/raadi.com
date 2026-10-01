import { Button } from '@raadi/ui';
import { Bell, MessageCircle, Plus, Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { unreadCount, unreadNotifications } from '@/lib/api';
import { getSession } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';

// The header and footer appear on every page, and their targets are dynamic,
// per-user pages. Prefetching them would cost about ten full server renders per
// page view (each with a session lookup and the unread counts) for results that
// go stale immediately, so these links have prefetch={false}.
export async function Header({ locale }: { locale: string }) {
  const [t, session] = await Promise.all([getTranslations('nav'), getSession()]);
  const [unread, alerts] = session.authenticated
    ? await Promise.all([unreadCount(), unreadNotifications()])
    : [0, 0];
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(`/${locale}/account`)}&locale=${locale}`;

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          prefetch={false}
          href="/"
          className="text-2xl font-extrabold tracking-tight text-primary"
          aria-label="Raadi"
        >
          raadi
        </Link>
        <nav className="flex items-center gap-2" aria-label={t('main')}>
          <Button asChild variant="ghost" size="sm">
            <Link href="/search" prefetch={false} data-testid="nav-search">
              <Search aria-hidden />
              <span className="hidden sm:inline">{t('search')}</span>
            </Link>
          </Button>
          <LocaleSwitcher label={t('language')} />
          <Button asChild size="sm">
            <Link href="/listings/new" prefetch={false} data-testid="nav-new-listing">
              <Plus aria-hidden />
              <span className="hidden sm:inline">{t('newListing')}</span>
            </Link>
          </Button>
          {session.authenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link
                  href="/messages"
                  prefetch={false}
                  data-testid="nav-messages"
                  className="relative"
                >
                  <MessageCircle aria-hidden />
                  <span className="hidden sm:inline">{t('messages')}</span>
                  {unread > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-bold text-white"
                      data-testid="nav-unread"
                      aria-label={t('unread', { count: unread })}
                    >
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link
                  prefetch={false}
                  href="/notifications"
                  data-testid="nav-notifications"
                  className="relative"
                  aria-label={t('notifications')}
                >
                  <Bell aria-hidden />
                  {alerts > 0 ? (
                    <span
                      className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-xs font-bold text-white"
                      data-testid="nav-alerts"
                    >
                      {alerts > 99 ? '99+' : alerts}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/my/listings" prefetch={false} data-testid="nav-my-listings">
                  {t('myListings')}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/account" prefetch={false} data-testid="nav-account">
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
