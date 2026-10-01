import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { LoggerOptions } from 'pino';

/** Paths that must never reach logs (credentials, session material, PII-heavy fields). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.secret',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
  '*.client_secret',
];

/** pino options producing single-line JSON with ISO timestamps and level names. */
export function loggerOptions(
  service: string,
  level = process.env.LOG_LEVEL ?? 'info',
): LoggerOptions {
  return {
    level,
    base: { service },
    messageKey: 'msg',
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  };
}

/** Honour an inbound X-Request-Id (if sane) or create one. */
export function requestId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  const candidate = Array.isArray(header) ? header[0] : header;
  return candidate && /^[\w.-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}
