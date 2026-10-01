import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface JwtVerifierOptions {
  /** Issuer as it appears in tokens (the public Keycloak URL). */
  issuer: string;
  /** JWKS endpoint reachable from inside the network. */
  jwksUrl: string;
  audience: string;
  clockToleranceSec?: number;
}

export interface Principal {
  sub: string;
  email?: string;
  name?: string;
  locale?: string;
  roles: string[];
  scopes: string[];
  claims: JWTPayload;
}

/** Validates RS256/ES256 access tokens against the IdP's JWKS (cached + rotated by jose). */
export class JwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly opts: JwtVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(opts.jwksUrl), {
      cooldownDuration: 30_000,
      timeoutDuration: 5000,
    });
  }

  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.opts.issuer,
      audience: this.opts.audience,
      algorithms: ['RS256', 'ES256', 'PS256'],
      clockTolerance: this.opts.clockToleranceSec ?? 30,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
    return {
      sub: payload.sub as string,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      locale: typeof payload.locale === 'string' ? payload.locale : undefined,
      roles: Array.isArray(realmAccess?.roles)
        ? realmAccess.roles.filter((r): r is string => typeof r === 'string')
        : [],
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
      claims: payload,
    };
  }
}
