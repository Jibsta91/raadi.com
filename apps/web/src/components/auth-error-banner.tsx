import { getTranslations } from 'next-intl/server';

const KNOWN = ['expired', 'cancelled', 'login_failed', 'idp_error'] as const;

export async function AuthErrorBanner({ code }: { code: string }) {
  const t = await getTranslations('auth.error');
  const key = (KNOWN as readonly string[]).includes(code) ? code : 'login_failed';
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      {t(key)}
    </div>
  );
}
