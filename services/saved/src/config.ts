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
    DB_NAME: z.string().default('saved'),
    DB_USER: z.string().default('saved'),
    KAFKA_BROKERS: z.string().default('kafka:9092'),
    KAFKA_USERNAME: z.string().default('saved'),
    /** A listing's public data when someone favourites it (the user's token is forwarded). */
    LISTINGS_URL: z.url().default('http://listings:4000'),
    /** Saved searches are repeated through the search API, so they match exactly what people see. */
    SEARCH_URL: z.url().default('http://search:4000'),
    /** How often each saved search is checked for new listings. */
    SAVED_SEARCH_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(300),
    /**
     * Listings become searchable a few seconds after publishing: only look up to this long ago,
     * so nothing slips between two checks.
     */
    SAVED_SEARCH_LAG_SECONDS: z.coerce.number().int().min(0).default(30),
    MAX_FAVOURITES: z.coerce.number().int().min(1).default(500),
    MAX_SAVED_SEARCHES: z.coerce.number().int().min(1).default(25),
  });

export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  db_password: z.string().min(16),
  kafka_password: z.string().min(16),
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
  const raw = await readSecrets(env, { '': 'raadi/saved', imgproxy: 'raadi/shared/imgproxy' });
  return { env, secrets: secretsSchema.parse(raw) };
}
