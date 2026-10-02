import { baseEnvSchema, loadEnv, openBaoEnvSchema, readSecrets } from '@raadi/service-kit';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const envSchema = baseEnvSchema.extend(openBaoEnvSchema.shape).extend({
  PORT: z.coerce.number().int().default(4000),
  /** Where browsers reach the hosted payment page. */
  PUBLIC_URL: z.url(),
  VIPPS_CLIENT_ID: z.string().min(1),
  VIPPS_MSN: z.string().min(1),
  /** Raadi's webhook endpoint (the mock delivers like Vipps does). */
  WEBHOOK_URL: z.url(),
  /** Deliver every webhook twice, as real providers sometimes do (tests de-duplication). */
  DUPLICATE_WEBHOOKS: bool.default(true),
  /** Unanswered payments expire after this many minutes. */
  EXPIRY_MINUTES: z.coerce.number().int().min(1).default(10),
});
export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  client_secret: z.string().min(16),
  subscription_key: z.string().min(16),
  webhook_secret: z.string().min(16),
});

export interface AppConfig {
  env: Env;
  secrets: z.infer<typeof secretsSchema>;
}

export async function loadAppConfig(): Promise<AppConfig> {
  const env = loadEnv(envSchema);
  const raw = await readSecrets(env, { '': 'raadi/payments-mock' });
  return { env, secrets: secretsSchema.parse(raw) };
}
