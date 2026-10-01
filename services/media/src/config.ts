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
    DB_NAME: z.string().default('media'),
    DB_USER: z.string().default('media'),
    S3_ENDPOINT: z.url().default('http://seaweedfs:8333'),
    S3_ACCESS_KEY_ID: z.string().default('media'),
    S3_REGION: z.string().default('us-east-1'),
    MEDIA_BUCKET: z.string().default('raadi-media'),
    UPLOAD_BUCKET: z.string().default('raadi-uploads'),
    IMGPROXY_INTERNAL_URL: z.url().default('http://imgproxy:8080'),
    CLAMAV_HOST: z.string().default('clamav'),
    CLAMAV_PORT: z.coerce.number().int().default(3310),
    KAFKA_BROKERS: z.string().default('kafka:9092'),
    KAFKA_USERNAME: z.string().default('media'),
    OPENFGA_URL: z.url().default('http://openfga:8080'),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .default(10 * 1024 * 1024),
    /** Unattached uploads older than this are deleted (storage limitation, GDPR Art. 5(1)(e)). */
    ORPHAN_TTL_HOURS: z.coerce.number().min(1).default(24),
    SEED_DEMO_DATA: z.enum(['true', 'false']).default('false'),
  });

export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  db_password: z.string().min(16),
  s3_secret: z.string().min(16),
  kafka_password: z.string().min(16),
  fga_key: z.string().min(16),
  'imgproxy.key': z.string().regex(/^[0-9a-f]{64}$/),
  'imgproxy.salt': z.string().regex(/^[0-9a-f]{64}$/),
});

export interface AppConfig {
  env: Env;
  secrets: z.infer<typeof secretsSchema>;
}

export async function loadAppConfig(): Promise<AppConfig> {
  const env = loadEnv(envSchema);
  const raw = await readSecrets(env, { '': 'raadi/media', imgproxy: 'raadi/shared/imgproxy' });
  return { env, secrets: secretsSchema.parse(raw) };
}
