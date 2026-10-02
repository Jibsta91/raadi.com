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
    DB_NAME: z.string().default('trust'),
    DB_USER: z.string().default('trust'),
    KAFKA_BROKERS: z.string().default('kafka:9092'),
    KAFKA_USERNAME: z.string().default('trust'),
    /** Seller names come from listings' internal API (events carry no names). */
    LISTINGS_URL: z.url().default('http://listings:4000'),
    /** Redirects after verification go back here. */
    PUBLIC_BASE_URL: z.url(),
    /** Buyer and seller may review each other for this long after the sale. */
    REVIEW_WINDOW_DAYS: z.coerce.number().int().min(1).default(30),
    /**
     * BankID OIDC provider. In development this is the `bankid-mock` realm in
     * the local Keycloak; in production a BankID OIDC issuer (ADR-0018).
     */
    BANKID_ISSUER: z.url(),
    BANKID_CLIENT_ID: z.string().min(1).default('raadi'),
    /**
     * Where this service reaches the provider (discovery, token, JWKS) when that
     * differs from the public issuer, e.g. http://keycloak:8080/realms/bankid-mock.
     */
    BANKID_BACKCHANNEL_URL: z
      .union([z.literal(''), z.url()])
      .optional()
      .transform((v) => v || undefined),
  });

export type Env = z.infer<typeof envSchema>;

export const secretsSchema = z.object({
  db_password: z.string().min(16),
  kafka_password: z.string().min(16),
  bankid_client_secret: z.string().min(16),
  /** HMAC key for identity hashes: a stolen database alone cannot be matched to people. */
  identity_pepper: z.string().min(32),
});

export interface AppConfig {
  env: Env;
  secrets: z.infer<typeof secretsSchema>;
}

/** Environment from process.env, secrets from OpenBao (AppRole). */
export async function loadAppConfig(): Promise<AppConfig> {
  const env = loadEnv(envSchema);
  const raw = await readSecrets(env, { '': 'raadi/trust' });
  return { env, secrets: secretsSchema.parse(raw) };
}
