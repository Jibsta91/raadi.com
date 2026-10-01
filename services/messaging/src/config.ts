import {
  authEnvSchema,
  baseEnvSchema,
  dbEnvSchema,
  loadEnv,
  openBaoEnvSchema,
  readSecrets,
} from '@raadi/service-kit';
import { z } from 'zod';

export const envSchema = baseEnvSchema
  .extend(authEnvSchema.shape)
  .extend(openBaoEnvSchema.shape)
  .extend(dbEnvSchema.shape)
  .extend({
    PORT: z.coerce.number().int().default(4000),
    DB_NAME: z.string().default('messaging'),
    DB_USER: z.string().default('messaging'),
    LISTINGS_URL: z.url().default('http://listings:4000'),
    VALKEY_HOST: z.string().default('valkey'),
    VALKEY_PORT: z.coerce.number().int().default(6379),
    VALKEY_USER: z.string().default('messaging'),
    /** Browser origin allowed to open the WebSocket (cross-site WebSocket hijacking guard). */
    PUBLIC_BASE_URL: z.url(),
    SEED_DEMO_DATA: z.enum(['true', 'false']).default('false'),
  });

export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  db_password: z.string().min(16),
  valkey_password: z.string().min(16),
  'imgproxy.key': z.string().regex(/^[0-9a-f]{64}$/),
  'imgproxy.salt': z.string().regex(/^[0-9a-f]{64}$/),
});

export interface AppConfig {
  env: Env;
  secrets: z.infer<typeof secretsSchema>;
}

/** Environment from process.env, secrets from OpenBao (AppRole). */
export async function loadAppConfig(): Promise<AppConfig> {
  const env = loadEnv(envSchema);
  const raw = await readSecrets(env, { '': 'raadi/messaging', imgproxy: 'raadi/shared/imgproxy' });
  return { env, secrets: secretsSchema.parse(raw) };
}
