// Native app: OIDC Authorization Code + PKCE against Keycloak's public `raadi-mobile` client (ADR-0021).
// The refresh token lives in the platform keystore (expo-secure-store); the access token only in
// memory. The gateway passes bearer tokens through untouched and every service validates them.
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { needsRefresh, readClaims } from '../claims';
import { config } from '../config';
import { AuthContext } from './context';
import type { Auth, AuthUser } from './types';

WebBrowser.maybeCompleteAuthSession();

const REFRESH_KEY = 'raadi.refreshToken';
const ID_TOKEN_KEY = 'raadi.idToken';
const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

interface Tokens {
  accessToken: string;
  expiresAt: number;
}

const redirectUri = AuthSession.makeRedirectUri({ scheme: 'raadi', path: 'auth' });

function userFrom(idToken: string | null | undefined): AuthUser | null {
  const claims = idToken ? readClaims(idToken) : null;
  return claims ? { id: claims.sub, email: claims.email, name: claims.name } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Auth['status']>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState(false);
  const discovery = useRef<AuthSession.DiscoveryDocument | null>(null);
  const tokens = useRef<Tokens | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const getDiscovery = useCallback(async () => {
    discovery.current ??= await AuthSession.fetchDiscoveryAsync(config.issuer);
    return discovery.current;
  }, []);

  const store = useCallback(async (res: AuthSession.TokenResponse) => {
    tokens.current = {
      accessToken: res.accessToken,
      expiresAt: (res.issuedAt + (res.expiresIn ?? 60)) * 1000,
    };
    // Keycloak rotates refresh tokens: always keep the newest one.
    if (res.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken);
    if (res.idToken) {
      await SecureStore.setItemAsync(ID_TOKEN_KEY, res.idToken);
      setUser(userFrom(res.idToken));
    }
  }, []);

  const clear = useCallback(async () => {
    tokens.current = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
    setUser(null);
    setStatus('signedOut');
  }, []);

  /** One refresh at a time: concurrent requests share it (refresh tokens are single-use). */
  const refresh = useCallback(async (): Promise<string | null> => {
    refreshing.current ??= (async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refreshToken) return null;
      try {
        const res = await AuthSession.refreshAsync(
          { clientId: config.clientId, refreshToken, scopes: SCOPES },
          await getDiscovery(),
        );
        await store(res);
        setStatus('signedIn');
        return res.accessToken;
      } catch {
        await clear();
        return null;
      }
    })().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [clear, getDiscovery, store]);

  const accessToken = useCallback(async (): Promise<string | null> => {
    const current = tokens.current;
    if (current && !needsRefresh(current.expiresAt)) return current.accessToken;
    return refresh();
  }, [refresh]);

  // Restore the session from the keystore on start.
  useEffect(() => {
    (async () => {
      setUser(userFrom(await SecureStore.getItemAsync(ID_TOKEN_KEY)));
      const token = await refresh();
      setStatus(token ? 'signedIn' : 'signedOut');
    })().catch(() => setStatus('signedOut'));
  }, [refresh]);

  const signIn = useCallback(async () => {
    setError(false);
    try {
      const doc = await getDiscovery();
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri,
        scopes: SCOPES,
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
      });
      const result = await request.promptAsync(doc);
      if (result.type !== 'success' || !result.params.code) {
        if (result.type === 'error') setError(true);
        return;
      }
      const res = await AuthSession.exchangeCodeAsync(
        {
          clientId: config.clientId,
          code: result.params.code,
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        doc,
      );
      await store(res);
      setStatus('signedIn');
    } catch {
      setError(true);
    }
  }, [getDiscovery, store]);

  const signOut = useCallback(async () => {
    const doc = await getDiscovery().catch(() => null);
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    const idToken = await SecureStore.getItemAsync(ID_TOKEN_KEY);
    await clear();
    if (!doc) return;
    if (refreshToken) {
      await AuthSession.revokeAsync(
        {
          clientId: config.clientId,
          token: refreshToken,
          tokenTypeHint: AuthSession.TokenTypeHint.RefreshToken,
        },
        doc,
      ).catch(() => undefined);
    }
    // End the Keycloak browser session too, or the next sign-in would skip the login form.
    if (doc.endSessionEndpoint && idToken) {
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: redirectUri,
      });
      await WebBrowser.openAuthSessionAsync(
        `${doc.endSessionEndpoint}?${params}`,
        redirectUri,
      ).catch(() => undefined);
    }
  }, [clear, getDiscovery]);

  const authFetch = useCallback(
    async (request: Request): Promise<Response> => {
      const retry = request.clone();
      const token = await accessToken();
      if (token) request.headers.set('authorization', `Bearer ${token}`);
      const res = await fetch(request);
      if (res.status !== 401 || !token) return res;
      // The token may have been revoked or the clock skewed: refresh once and retry.
      const fresh = await refresh();
      if (!fresh) return res;
      retry.headers.set('authorization', `Bearer ${fresh}`);
      return fetch(retry);
    },
    [accessToken, refresh],
  );

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      error,
      signIn,
      signOut,
      fetch: authFetch,
      socketHeaders: async () => {
        const token = await accessToken();
        return token ? { Authorization: `Bearer ${token}` } : undefined;
      },
    }),
    [status, user, error, signIn, signOut, authFetch, accessToken],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
