import { Redis } from 'iovalkey';
import pg from 'pg';
import type { AppConfig } from '../config.js';

export type Valkey = Redis;

export function createValkey(cfg: AppConfig): Valkey {
  return new Redis({
    host: cfg.env.VALKEY_HOST,
    port: cfg.env.VALKEY_PORT,
    password: cfg.secrets.valkeyPassword,
    connectionName: 'identity-bff',
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    // Exponential backoff for reconnects, capped at 5s.
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
}

export function createPool(cfg: AppConfig): pg.Pool {
  return new pg.Pool({
    host: cfg.env.DB_HOST,
    port: cfg.env.DB_PORT,
    database: cfg.env.DB_NAME,
    user: cfg.env.DB_USER,
    password: cfg.secrets.dbPassword,
    max: cfg.env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    application_name: 'identity-bff',
  });
}
