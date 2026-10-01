import { pino } from 'pino';

// Same JSON shape as the services (see @raadi/service-kit/logger).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'web' },
  messageKey: 'msg',
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: ['*.cookie', '*.authorization', '*.token', '*.password'], censor: '[redacted]' },
});
