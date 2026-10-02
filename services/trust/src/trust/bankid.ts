import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { circuitBreaker } from '@raadi/service-kit';
import * as oidc from 'openid-client';
import type { AppConfig } from '../config.js';
import { APP_CONFIG } from '../tokens.js';

export interface PendingVerification {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * BankID over OIDC (Authorization Code + PKCE, confidential client). The
 * provider's metadata is read lazily, so startup does not depend on it. When
 * BANKID_BACKCHANNEL_URL is set, server-to-server calls (discovery, token,
 * JWKS) go there while the browser is sent to the public issuer.
 *
 * Only `openid` is requested: Raadi needs to know that a real person signed in,
 * not who they are. The provider's `sub` is kept as a keyed hash.
 */
@Injectable()
export class BankIdClient {
  readonly redirectUri: string;
  private config?: Promise<oidc.Configuration>;
  private readonly discover;
  private readonly codeGrant;

  constructor(@Inject(APP_CONFIG) private readonly cfg: AppConfig) {
    this.redirectUri = `${cfg.env.PUBLIC_BASE_URL}/api/v1/trust/verification/callback`;
    this.discover = circuitBreaker(() => this.loadConfiguration(), {
      name: 'bankid-discovery',
      timeoutMs: 5000,
    });
    this.codeGrant = circuitBreaker(
      async (url: URL, pending: PendingVerification) =>
        oidc.authorizationCodeGrant(await this.configuration(), url, {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        }),
      { name: 'bankid-code-grant', timeoutMs: 8000 },
    );
  }

  newRequest(): PendingVerification {
    return {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
    };
  }

  async authorizationUrl(pending: PendingVerification, uiLocale: string): Promise<URL> {
    return oidc.buildAuthorizationUrl(await this.configuration(), {
      redirect_uri: this.redirectUri,
      scope: 'openid',
      response_type: 'code',
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      ui_locales: uiLocale,
      // Always ask the person to authenticate, never reuse a provider session.
      prompt: 'login',
    });
  }

  /** Exchanges the code and returns the verified person's keyed identity hash. */
  async complete(query: string, pending: PendingVerification): Promise<Buffer> {
    const url = new URL(`${this.redirectUri}${query}`);
    const tokens = await this.codeGrant.fire(url, pending);
    const sub = tokens.claims()?.sub;
    if (!sub) throw new Error('id token without subject');
    return identityHash(this.cfg.secrets.identity_pepper, this.cfg.env.BANKID_ISSUER, sub);
  }

  private configuration(): Promise<oidc.Configuration> {
    this.config ??= this.discover.fire().catch((error: unknown) => {
      this.config = undefined; // try again on the next request
      throw error;
    });
    return this.config;
  }

  private async loadConfiguration(): Promise<oidc.Configuration> {
    const { env, secrets } = this.cfg;
    const issuer = env.BANKID_ISSUER.replace(/\/$/, '');
    const back = (env.BANKID_BACKCHANNEL_URL ?? issuer).replace(/\/$/, '');
    const res = await fetch(`${back}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`BankID discovery returned ${res.status}`);
    const meta = (await res.json()) as oidc.ServerMetadata;
    if (meta.issuer !== issuer) throw new Error(`unexpected issuer ${meta.issuer}`);
    // The browser uses the public endpoints; this service uses the back channel.
    const internal = (url: string | undefined) =>
      url && back !== issuer ? url.replace(issuer, back) : url;
    const config = new oidc.Configuration(
      {
        ...meta,
        token_endpoint: internal(meta.token_endpoint),
        jwks_uri: internal(meta.jwks_uri),
      },
      env.BANKID_CLIENT_ID,
      { client_secret: secrets.bankid_client_secret },
      oidc.ClientSecretBasic(secrets.bankid_client_secret),
    );
    // The back channel is plain HTTP on the private network; TLS ends at Traefik.
    if (back.startsWith('http:')) oidc.allowInsecureRequests(config);
    return config;
  }
}

/**
 * HMAC-SHA256 of the provider and its subject identifier. Equal for the same
 * person at the same provider, meaningless without the key from OpenBao.
 */
export function identityHash(pepper: string, issuer: string, sub: string): Buffer {
  return createHmac('sha256', pepper).update(`${issuer}\n${sub}`).digest();
}
