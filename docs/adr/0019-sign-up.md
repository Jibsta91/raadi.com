# 0019 — Sign-up: Keycloak's hosted registration with a Raadi theme

- Status: Accepted
- Date: 2026-10-02

## Decision

- **Registration stays on Keycloak's hosted pages.** Raadi has no password form of its own: credentials only
  ever reach the identity provider, as with login ([ADR-0004](0004-token-handler-bff.md)). The header has a
  **Sign up** button. identity-bff's `/auth/login?signup=1` starts the usual Authorization Code + PKCE flow
  with OIDC `prompt=create`, which opens the registration form directly.
- **A `raadi` login and e-mail theme** (`deploy/keycloak/themes/raadi`, copied into the Keycloak image)
  extends Keycloak's current `keycloak.v2` theme. It adds a stylesheet (the web app's colours) and Raadi
  wording in English, Norwegian and **Somali** (Keycloak ships no Somali; missing keys fall back to
  English). Templates are inherited, so upstream security fixes keep applying. Only `terms.ftl` is
  overridden, so the terms text can link to the app's own domain.
- **The password is set after the e-mail address is confirmed.** This is Keycloak 26.8's behaviour when e-mail
  verification is on. It prevents account pre-hijacking (registering someone else's address first and
  waiting for them to use it).
- **Password policy** (OWASP ASVS 2.1): 12–128 characters, not the e-mail or username, and not on a list of
  46,146 common passwords of 12+ characters (SecLists, MIT; checked offline with Keycloak's
  `passwordBlacklist`). No composition rules, which NIST 800-63B advises against.
- **Terms of use** are accepted on the first login through Keycloak's built-in required action (`/terms`
  in the app). Existing users are not asked again.
- **Welcome page:** after a user's first login, identity-bff redirects to `/{locale}/welcome?next=<target>`.
  It points to the language menu, BankID verification ([ADR-0018](0018-reviews-and-trust.md)) and passkeys,
  then continues to the original target.
- No CAPTCHA. reCAPTCHA is neither OSI-licensed nor offline. Bots are slowed down by the strict
  rate limit on Keycloak's credential endpoints, brute-force detection, and having to confirm an e-mail
  address before an account works.

## Alternatives considered

- **Our own registration form calling the Keycloak Admin API**: Raadi would handle raw passwords and
  need admin rights, and verification, policies and passkeys would be re-implemented.
- **Keycloakify (React themes)**: a full design system for Keycloak pages, but a build pipeline and
  templates to maintain for every Keycloak upgrade. CSS plus messages cover the branding we need.
- **Password on the registration form** (`Password Validation` before e-mail verification): the old default.
  It is easier to test, but open to account pre-hijacking.

## Consequences

Sign-up needs a working mail server (Mailpit in development). Keycloak pages that the theme does not
translate show English to Somali users. A breached-password check against a live service (Have I Been
Pwned) is not possible offline; the static list is the offline equivalent.
