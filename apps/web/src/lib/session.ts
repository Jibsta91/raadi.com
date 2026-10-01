import { createIdentityClient, type Me, type Session } from '@raadi/api-client';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { env } from './env';
import { logger } from './logger';

async function cookieHeader(): Promise<string | null> {
  const jar = await cookies();
  return jar.has(env.sessionCookie) ? jar.toString() : null;
}

/** Current session (from identity-bff). Cached per request. */
export const getSession = cache(async (): Promise<Session> => {
  const cookie = await cookieHeader();
  if (!cookie) return { authenticated: false };
  try {
    const client = createIdentityClient({ baseUrl: env.identityBffUrl });
    const { data } = await client.GET('/auth/session', {
      headers: { cookie },
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    return data ?? { authenticated: false };
  } catch (error) {
    logger.warn({ err: error }, 'session lookup failed');
    return { authenticated: false };
  }
});

/**
 * Server-side token handling: exchange the session cookie for a short-lived
 * access token at identity-bff (the same call Traefik's forwardAuth makes),
 * then call the API with it. Tokens never reach the browser.
 */
async function accessToken(): Promise<string | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  const res = await fetch(`${env.identityBffUrl}/auth/forward`, {
    headers: { cookie, 'x-forwarded-method': 'GET' },
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
  });
  return res.ok ? (res.headers.get('authorization')?.replace(/^Bearer /, '') ?? null) : null;
}

export const getMe = cache(async (): Promise<Me | null> => {
  const token = await accessToken();
  if (!token) return null;
  const client = createIdentityClient({ baseUrl: env.identityBffUrl });
  const { data, error } = await client.GET('/api/v1/identity/me', {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3000),
  });
  if (error) logger.warn({ error }, 'profile lookup failed');
  return data ?? null;
});
