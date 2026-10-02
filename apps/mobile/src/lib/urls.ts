// URL helpers; unit-tested in test/urls.test.ts.

/**
 * The API returns gateway-relative paths (signed imgproxy URLs, for example). The web build resolves
 * them against its own origin; a native app has no origin, so they are made absolute.
 */
export function absoluteUrl(pathOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!baseUrl) return pathOrUrl;
  return `${baseUrl.replace(/\/+$/, '')}/${pathOrUrl.replace(/^\/+/, '')}`;
}

/** The messaging WebSocket lives on the same gateway as the API. */
export function websocketUrl(baseUrl: string, path: string): string {
  const url = new URL(path, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Only same-app paths may be used as a post-login destination. */
export function safeAppPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}
