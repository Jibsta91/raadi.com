# Threat model (Phase 1 scope)

Method: STRIDE per trust boundary. Target: OWASP ASVS 4.0 Level 2. GDPR applies (Norway/EU). This document
grows with each phase; Phase 6 adds a full ASVS checklist.

## Trust boundaries

1. **Internet → Traefik** (only published ports: 80/443).
2. **Traefik → services** (internal Docker network; no service is published directly).
3. **Services → data stores / OpenBao / Keycloak back channel.**
4. **Operators → admin surfaces** (Grafana SSO; Keycloak admin, OpenBao UI and Traefik dashboard are dev-only routes).

## Threats and mitigations

| STRIDE                 | Threat                            | Mitigation (implemented)                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spoofing               | Stolen/forged tokens              | Tokens never reach browsers (token-handler BFF). Every service verifies JWT signature, issuer, audience, expiry. PKCE S256 + state + nonce on login                                                                                                          |
| Spoofing               | Session fixation / hijack         | New 256-bit session id per login, HttpOnly + SameSite=Lax (+ Secure on HTTPS) cookie, server-side sessions encrypted with AES-256-GCM, logout revokes refresh token and ends the IdP session                                                                 |
| Spoofing               | Credential stuffing / brute force | Keycloak brute-force detection, password policy (≥12 chars, not username/email), per-IP rate limits on `/auth` and Keycloak, MFA (OTP) and passkeys available                                                                                                |
| Tampering              | CSRF on state-changing APIs       | Origin / Sec-Fetch-Site check in the forward-auth step and on logout, plus SameSite cookies                                                                                                                                                                  |
| Tampering              | Open redirect after login         | `returnTo` restricted to same-site relative paths (unit-tested)                                                                                                                                                                                              |
| Tampering              | Header smuggling / path confusion | Traefik deletes aliasing headers, rejects encoded `/`, `\`, NUL; strips untrusted X-Forwarded-*                                                                                                                                                              |
| Repudiation            | Untraceable actions               | Structured JSON logs with trace ids, Keycloak login/admin events, OpenBao audit log to stdout, outbox events                                                                                                                                                 |
| Information disclosure | Secrets leakage                   | No secrets in Git, images or env; first-boot generation; OpenBao AppRole per service with least-privilege policies; per-consumer secret files with owner-only permissions; log redaction (auth headers, cookies, tokens, passwords) plus collector scrubbing |
| Information disclosure | Error detail leakage              | RFC 9457 problem responses without internals; `X-Powered-By`/`Server` removed                                                                                                                                                                                |
| Information disclosure | Cross-service data access         | One database and role per service, `PUBLIC` revoked                                                                                                                                                                                                          |
| Denial of service      | Request floods                    | Token-bucket rate limits at the edge and in services (Valkey-backed), body size limits, timeouts, circuit breakers, memory limits per container                                                                                                              |
| Elevation of privilege | Container breakout                | Non-root, read-only root filesystems, `no-new-privileges`, all capabilities dropped for app containers, distroless runtime images, no Docker socket in any runtime container                                                                                 |

## Accepted risks / open items

- **OpenBao unseal key on the same host** (ADR-0005). Upgrade path: KMS/transit seal.
- **Internal traffic is plain HTTP** on a private Docker network; JWTs are validated on every hop. mTLS between
  services is a later hardening option.
- **CSP allows `'unsafe-inline'` scripts** for Next.js hydration. Phase 6 moves to nonce-based CSP.
- **CrowdSec and the Coraza WAF (OWASP CRS)** arrive in Phase 6.

## GDPR notes (Phase 1)

Data minimisation: the local profile stores only id, e-mail, display name, locale and timestamps. Events carry ids,
not personal data. Only one strictly necessary cookie is set, so no consent banner is required. Export (Art. 15),
erasure (Art. 17) and retention automation are delivered by the AI Governance pillar (Phase 4).
