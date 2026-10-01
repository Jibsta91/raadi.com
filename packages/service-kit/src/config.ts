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
