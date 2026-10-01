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

/** Verifier for tokens issued by the Raadi Keycloak realm (public issuer, internal JWKS). */
export function keycloakVerifier(env: {
  AUTH_BASE_URL: string;
  KEYCLOAK_INTERNAL_URL: string;
  KEYCLOAK_REALM: string;
  API_AUDIENCE: string;
}): JwtVerifier {
  return new JwtVerifier({
    issuer: `${env.AUTH_BASE_URL}/realms/${env.KEYCLOAK_REALM}`,
    jwksUrl: `${env.KEYCLOAK_INTERNAL_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
    audience: env.API_AUDIENCE,
  });
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

/** Public display name from token claims: "Kari N.", never the e-mail address. */
export function displayName(claims: Record<string, unknown>): string {
  const given = typeof claims.given_name === 'string' ? claims.given_name.trim() : '';
  const family = typeof claims.family_name === 'string' ? claims.family_name.trim() : '';
  if (given) return family ? `${given} ${family[0]!.toUpperCase()}.` : given;
  return 'Raadi-bruker';
}
