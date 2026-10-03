# 0021 — Mobile app: Expo, per-platform sign-in, web build under /m; one look ("Fjord Glass") for app and site

- Status: Accepted
- Date: 2026-10-03

## Decision

- **The app is an Expo app** (`apps/mobile`, Expo SDK 57, Expo Router, TypeScript) that uses the same
  `@raadi/api-client` and `@raadi/catalog/places` as the website. Expo pins React Native and React
  (0.86.3 and 19.2.3) through its bundled-module list; the website stays on React 19.3.0, and pnpm keeps the
  two apart (ADR-0010).
- **Sign-in depends on the platform:**
  - **iOS and Android:** OIDC authorization code with PKCE (`expo-auth-session`) against the public Keycloak
    client `raadi-mobile`. Redirects go to `raadi://` and `exp://`, and the audience is `raadi-api`. The
    refresh token lives in the device keychain (SecureStore).
  - **Web build:** the identity BFF's session cookie, exactly like the website (ADR-0004), so no token
    reaches browser JavaScript. Logout takes `?returnTo=` (a same-site path, validated like login's), so the
    app returns to itself.
- **A web build of the app is served under `/m`** by a small distroless Node server (`mobile-web`, 96 MB
  limit, ADR-0011) behind Traefik, with its own CSP. This lets the app run in a browser and in e2e tests
  without a device.
- **expo-router is patched** (`patches/expo-router@57.0.24.patch`): its `stripBaseUrl` removed `/m` without a
  path boundary, so `/my-listings` became `/y-listings` in exported builds. Remove the patch when upstream
  fixes it.
- **One live connection**: the app shares a single WebSocket for chat and badges. Native clients send the
  access token in the `Authorization` header.
- **One look for the app and the website, "Fjord Glass"**: a cool neutral ground, an ink colour, a blue accent
  (`#3b5bff` light, `#7b93ff` dark) and lime highlights for promoted listings. Frosted-glass surfaces are
  used only on floating chrome (tab bar, header, price chips, composer). The fonts are Bricolage Grotesque
  (display) and Geist (text). Both are OFL-1.1, bundled in the app and the site, and never fetched at
  runtime (ADR-0009). The tokens are defined once per platform with the same values: `apps/mobile/src/theme.tsx`
  and `apps/web/src/app/globals.css`.
- **The theme follows the device unless the user picks Light or Dark.**
  - App: the choice is stored on the device.
  - Website: the choice is kept in a `theme` cookie that the server reads to set `<html data-theme>`, so the
    first paint is right with no flash. The colours are `light-dark()` pairs, and Tailwind's `dark:` variant
    follows the same rule.

## Alternatives considered

- **A responsive website instead of an app**: no store presence, push or keychain. The web build under `/m`
  covers browser use at little cost.
- **Bare React Native or Flutter**: more native tooling to maintain, and no shared TypeScript client.
- **Tokens in browser JavaScript for the app's web build**: weaker than the BFF cookie that the website
  already uses.
- **The theme in `localStorage` on the website**: the server cannot read it, so pages would flash in the
  wrong theme. An inline script before paint would also work, but it needs a CSP exception.

## Consequences

- Two token stores (keychain and BFF session) and two Keycloak clients to keep aligned.
- Design changes touch two token files. Their values are kept identical and reviewed together.
- The expo-router patch must be checked on every Expo upgrade.
- Expo's build tooling brings in two packages with known issues and no fixed release yet: node-forge 1.4.0
  (CVE-2026-85393, through the Expo CLI) and braces 3.0.3 (CVE-2026-93687, through Metro). Both run only at
  build and development time and are not in any shipped image. The findings are accepted in
  `.trivyignore.yaml` and `osv-scanner.toml` until 2026-11-02; re-check them then.
- Two vulnerable transitive packages are lifted by scoped pnpm overrides in `pnpm-workspace.yaml`:
  `decode-uri-component` 0.5.0 under `query-string` (it ships in the app; checked with encoded and malformed
  query strings) and `uuid` 11 under `xcode` (native project generation). Drop the overrides when Expo's
  ranges include fixed versions.
