import pg from 'pg';
import type { z } from 'zod';
import type { dbEnvSchema } from './config.js';

export function createPgPool(
  env: z.infer<typeof dbEnvSchema>,
  password: string,
  applicationName: string,
): pg.Pool {
  return new pg.Pool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
    application_name: applicationName,
  });
}

/** Runs fn in a transaction; rolls back on error. */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
