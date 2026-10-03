import {
  authEnvSchema,
  baseEnvSchema,
  dbEnvSchema,
  loadEnv,
  openBaoEnvSchema,
  readSecrets,
} from '@raadi/service-kit';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const envSchema = baseEnvSchema
  .extend(authEnvSchema.shape)
  .extend(openBaoEnvSchema.shape)
  .extend(dbEnvSchema.shape)
  .extend({
    PORT: z.coerce.number().int().default(4000),
    DB_NAME: z.string().default('notifications'),
    DB_USER: z.string().default('notifications'),
    KAFKA_BROKERS: z.string().default('kafka:9092'),
    KAFKA_USERNAME: z.string().default('notifications'),
    /** Service account that may look up users' e-mail and language (view-users only). */
    KEYCLOAK_CLIENT_ID: z.string().default('notifications'),
    SMTP_HOST: z.string().default('mailpit'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_FROM: z.string().min(3),
    /** Links in e-mails point here. */
    PUBLIC_BASE_URL: z.url(),
    /** At most one new-message e-mail per conversation and recipient in this window. */
    EMAIL_THROTTLE_MINUTES: z.coerce.number().int().min(0).default(30),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(6),
    /** Expo's push API in production (https://exp.host/--/api/v2/push/send); push-mock in development. */
    PUSH_URL: z.url().default('http://push-mock:4000/--/api/v2/push/send'),
    /** At most one new-message push per conversation and recipient in this window. */
    PUSH_THROTTLE_SECONDS: z.coerce.number().int().min(0).default(60),
    PUSH_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    /** Seller on receipts: legal name and organisation number in production. */
    RECEIPT_MERCHANT: z.string().min(1).default('Raadiso (development, no organisation number)'),
  });

export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  db_password: z.string().min(16),
  kafka_password: z.string().min(16),
  keycloak_client_secret: z.string().min(16),
  /** Only when the mail server needs authentication (production). */
  smtp_password: z.string().optional(),
  /** Expo access token, when "enhanced push security" is on for the Expo project (production). */
  push_access_token: z.string().optional(),
});

export interface AppConfig {
  env: Env;
  secrets: z.infer<typeof secretsSchema>;
}

/** Environment from process.env, secrets from OpenBao (AppRole). */
export async function loadAppConfig(): Promise<AppConfig> {
  const env = loadEnv(envSchema);
  const raw = await readSecrets(env, { '': 'raadi/notifications' });
  return { env, secrets: secretsSchema.parse(raw) };
}
