import { circuitBreaker, retry } from '@raadi/service-kit';
import { z } from 'zod';
import { type Locale, toLocale } from './model.js';

const userSchema = z.object({
  enabled: z.boolean(),
  email: z.string().optional(),
  emailVerified: z.boolean().optional(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
});

export interface Recipient {
  email: string;
  locale: Locale;
}

class UserGone extends Error {}

/**
 * Looks up where to send a user's e-mail, at send time, from Keycloak (the
 * system of record). The service account may only view users. Addresses are
 * never stored by this service.
 */
export class UserDirectory {
  private token?: { value: string; expiresAt: number };
  private readonly breaker;

  constructor(
    private readonly opts: {
      keycloakUrl: string;
      realm: string;
      clientId: string;
      clientSecret: string;
    },
  ) {
    this.breaker = circuitBreaker(
      (userId: string) =>
        retry(() => this.fetchUser(userId), {
          retries: 2,
          baseDelayMs: 300,
          shouldRetry: (e) => !(e instanceof UserGone),
        }),
      { name: 'keycloak-users', timeoutMs: 15_000, errorFilter: (e) => e instanceof UserGone },
    );
  }

  /** The recipient, or null if the user no longer exists, is disabled or has no verified address. */
  async recipient(userId: string): Promise<Recipient | null> {
    try {
      const user = await this.breaker.fire(userId);
      if (!user.enabled || !user.email || user.emailVerified === false) return null;
      return { email: user.email, locale: toLocale(user.attributes?.locale?.[0]) };
    } catch (error) {
      if (error instanceof UserGone) return null;
      throw error;
    }
  }

  /** The user's language for a push, or null if the user no longer exists or is disabled. */
  async locale(userId: string): Promise<Locale | null> {
    try {
      const user = await this.breaker.fire(userId);
      return user.enabled ? toLocale(user.attributes?.locale?.[0]) : null;
    } catch (error) {
      if (error instanceof UserGone) return null;
      throw error;
    }
  }

  async ping(): Promise<void> {
    await this.accessToken();
  }

  private async fetchUser(userId: string) {
    const res = await fetch(
      `${this.opts.keycloakUrl}/admin/realms/${this.opts.realm}/users/${encodeURIComponent(userId)}`,
      {
        headers: { authorization: `Bearer ${await this.accessToken()}` },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.status === 404) throw new UserGone();
    if (res.status === 401) this.token = undefined;
    if (!res.ok) throw new Error(`Keycloak users API returned ${res.status}`);
    return userSchema.parse(await res.json());
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const res = await fetch(
      `${this.opts.keycloakUrl}/realms/${this.opts.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.opts.clientId,
          client_secret: this.opts.clientSecret,
        }),
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!res.ok) throw new Error(`Keycloak token endpoint returned ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }
}
