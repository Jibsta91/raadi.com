// Display data from an ID token. The app never makes security decisions from these claims: every
// service validates the access token itself (ADR-0004). Unit-tested in test/claims.test.ts.

export interface IdClaims {
  sub: string;
  email?: string;
  name?: string;
  locale?: string;
  exp?: number;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  // UTF-8 without TextDecoder, which Hermes (React Native's engine) does not provide.
  return decodeURIComponent(
    Array.from(binary, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  );
}

export function readClaims(jwt: string): IdClaims | null {
  const payload = jwt.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as Record<string, unknown>;
    if (typeof claims.sub !== 'string') return null;
    return {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      locale: typeof claims.locale === 'string' ? claims.locale : undefined,
      exp: typeof claims.exp === 'number' ? claims.exp : undefined,
    };
  } catch {
    return null;
  }
}

/** Refresh a little before expiry so a request never leaves with a token that dies in flight. */
export function needsRefresh(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return expiresAtMs - nowMs < 30_000;
}
