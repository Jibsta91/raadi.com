import { z } from 'zod';

/**
 * Parses and validates configuration from the environment (12-factor).
 * Fails fast with a readable list of problems instead of starting half-configured.
 */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  return result.data;
}

/** Common environment shared by every Raadi service. */
export const baseEnvSchema = z.object({
  RAADI_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65535),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(3000),
});

/** Token validation against Keycloak (every service validates JWTs itself). */
export const authEnvSchema = z.object({
  AUTH_BASE_URL: z.url(),
  KEYCLOAK_INTERNAL_URL: z.url().default('http://keycloak:8080'),
  KEYCLOAK_REALM: z.string().min(1).default('raadi'),
  API_AUDIENCE: z.string().min(1).default('raadi-api'),
});

/** Where the service's AppRole credentials are mounted (ADR-0005). */
export const openBaoEnvSchema = z.object({
  OPENBAO_ADDR: z.url().default('http://openbao:8200'),
  OPENBAO_ROLE_ID_FILE: z.string().default('/run/secrets/openbao/role_id'),
  OPENBAO_SECRET_ID_FILE: z.string().default('/run/secrets/openbao/secret_id'),
});

/** PostgreSQL connection (database per service, ADR-0008); the password comes from OpenBao. */
export const dbEnvSchema = z.object({
  DB_HOST: z.string().default('postgres'),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
});
