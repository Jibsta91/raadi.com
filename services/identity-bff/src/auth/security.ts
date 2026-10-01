/** Pure security helpers (unit tested). */

const SUPPORTED = ['nb', 'en', 'so'] as const;
export type Locale = (typeof SUPPORTED)[number];

/**
 * Only same-site relative paths are allowed as post-login redirect targets
 * (prevents open redirects such as "//evil.com" or "/\\evil.com").
 */
export function safeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex -- deliberately rejects control characters (header/URL injection)
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'http://raadi.invalid');
    return url.host === 'raadi.invalid' ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function normaliseLocale(value: unknown): Locale {
  return SUPPORTED.includes(value as Locale) ? (value as Locale) : 'nb';
}

/** Keycloak ships Norwegian as "no" and has no Somali bundle (falls back to English). */
export function keycloakUiLocale(locale: Locale): string {
  return locale === 'nb' ? 'no' : 'en';
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the browser
 * must prove the request comes from our own origin (Origin header, or
 * Sec-Fetch-Site when Origin is absent). SameSite=Lax cookies are the first layer.
 */
export function isCsrfSafe(
  method: string,
  headers: { origin?: string | string[]; 'sec-fetch-site'?: string | string[] },
  allowedOrigins: string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const origin = first(headers.origin);
  if (origin) return allowedOrigins.includes(origin);
  const site = first(headers['sec-fetch-site']);
  return site === 'same-origin';
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
