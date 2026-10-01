# 0004 — Token-handler BFF and zero-trust JWT validation

- Status: Accepted
- Date: 2026-10-01

## Context

SPA-style token storage in the browser exposes tokens to XSS. The platform must apply OIDC everywhere and
zero trust between services (OWASP ASVS L2).

## Decision

- **identity-bff** is a confidential OIDC client (Authorization Code + PKCE S256) against Keycloak. It keeps tokens
  server-side in Valkey. Values are encrypted with AES-256-GCM, keys are SHA-256 of an opaque 256-bit session
  id, and the browser holds only an `HttpOnly; SameSite=Lax` cookie (`Secure` over HTTPS).
- Traefik's `forwardAuth` calls `identity-bff /auth/forward` for `/api/*` routes. That swaps the cookie for a
  short-lived access token in the upstream `Authorization` header (refreshing it under a per-session lock,
  since refresh tokens are single-use). Mobile bearer tokens pass through untouched. `/auth/forward` is not
  publicly routable.
- **CSRF**: state-changing cookie-authenticated requests must carry an allowed `Origin` (or
  `Sec-Fetch-Site: same-origin`). SameSite=Lax is the first layer.
- **Every service validates every JWT** (signature via JWKS, issuer, audience `raadi-api`, expiry). Roles come
  from `realm_access`. Fine-grained authorization (OpenFGA ReBAC + OPA policies) arrives with Phase 2's
  resource-owning services.
- Server-side rendering uses the same token-handler call from the web server. Tokens never reach browser JS.
- Keycloak runs with a fixed public hostname and a dynamic back channel. Tokens always carry the public
  issuer while services fetch JWKS internally.

## Consequences

- XSS cannot exfiltrate tokens; logout revokes the refresh token and ends the Keycloak session (RP-initiated).
- One extra hop per API call (forwardAuth, a Valkey read, usually no Keycloak call).
- Development over plain `http://*.localhost` works because browsers treat `.localhost` as a secure context
  (Keycloak's cookies are always `Secure`).
