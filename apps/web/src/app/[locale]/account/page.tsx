import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@raadi/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { env } from '@/lib/env';
import { getMe, getSession } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('title'), robots: { index: false } };
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session.authenticated) {
    redirect(`/auth/login?returnTo=${encodeURIComponent(`/${locale}/account`)}&locale=${locale}`);
  }
  const [t, format, me] = await Promise.all([getTranslations('account'), getFormatter(), getMe()]);
  const user = session.user;
  const date = (iso: string | null | undefined) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{me?.displayName ?? user.name ?? user.email}</CardTitle>
          <CardDescription>{t('signedInAs', { email: user.email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t('email')}</dt>
            <dd data-testid="account-email">{user.email}</dd>
            <dt className="text-muted-foreground">{t('locale')}</dt>
            <dd>{t(`locales.${me?.locale ?? user.locale}`)}</dd>
            <dt className="text-muted-foreground">{t('roles')}</dt>
            <dd className="flex flex-wrap gap-1">
              {user.roles
                .filter(
                  (r) =>
                    !r.startsWith('default-roles-') &&
                    r !== 'offline_access' &&
                    r !== 'uma_authorization',
                )
                .map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
            </dd>
            <dt className="text-muted-foreground">{t('memberSince')}</dt>
            <dd>{date(me?.createdAt)}</dd>
            <dt className="text-muted-foreground">{t('lastLogin')}</dt>
            <dd>{date(me?.lastLoginAt)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('securityTitle')}</CardTitle>
          <CardDescription>{t('securityHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <a href={`${env.authBaseUrl}/realms/${env.realm}/account`}>{t('manageSecurity')}</a>
          </Button>
          <form action="/auth/logout" method="post">
            <Button type="submit" variant="secondary">
              {t('logout')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
