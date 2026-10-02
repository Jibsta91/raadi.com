// Web build: the app is served by the gateway under /m and signs in exactly like the website, through
// the identity BFF's session cookie (ADR-0004). No token ever reaches browser JavaScript.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { safeAppPath } from '../urls';
import { AuthContext } from './context';
import type { Auth, AuthUser } from './types';

interface SessionResponse {
  authenticated: boolean;
  user?: { id: string; email: string; name?: string };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [status, setStatus] = useState<Auth['status']>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const error = useMemo(() => new URLSearchParams(window.location.search).has('authError'), []);

  useEffect(() => {
    let cancelled = false;
    fetch('/auth/session', { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? (res.json() as Promise<SessionResponse>) : null))
      .then((session) => {
        if (cancelled) return;
        if (session?.authenticated && session.user) {
          setUser({ id: session.user.id, email: session.user.email, name: session.user.name });
          setStatus('signedIn');
        } else {
          setStatus('signedOut');
        }
      })
      .catch(() => !cancelled && setStatus('signedOut'));
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (returnTo?: string) => {
      const here = `${window.location.pathname}${window.location.search}`;
      const params = new URLSearchParams({
        returnTo: safeAppPath(returnTo ?? here, '/m/'),
        locale,
      });
      window.location.assign(`/auth/login?${params}`);
    },
    [locale],
  );

  const signOut = useCallback(async () => {
    // A top-level form POST, so the BFF can end the Keycloak session with a redirect.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `/auth/logout?${new URLSearchParams({ returnTo: '/m/account' })}`;
    document.body.append(form);
    form.submit();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      error,
      signIn,
      signOut,
      fetch: (request) => fetch(request),
      socketHeaders: async () => undefined,
    }),
    [status, user, error, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
