/**
 * The in-app path a push asks to open, or null. Only plain app paths are followed ("/messages/…"):
 * never URLs, protocol-relative paths or anything odd, so a forged push cannot send the user out
 * of the app.
 */
export function safeAppPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(value) || value.startsWith('//')) return null;
  return value;
}
