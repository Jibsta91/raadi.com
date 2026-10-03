# Mobile app

The Expo app in `apps/mobile` covers browsing, search, listing details, live chat, My listings and the
account (language and appearance). [ADR-0021](adr/0021-mobile-app-and-fjord-glass.md) records the decisions.

## Running it

- **In a browser** (works today): `./raadi up` builds the app's web export and serves it at
  <http://raadi.localhost/m/>. The `mobile-web` image runs `expo export` with `MOBILE_WEB_BASE_URL=/m`, and
  a small Node server (`apps/mobile/server/serve.mjs`) serves the files. The page signs in through the identity
  BFF's session cookie, like the website. After changing app code:
  `docker compose build mobile-web && docker compose up -d mobile-web`. Traefik can answer 503 for about 10 s
  while the new container passes its health check.
- **On a phone**: `./raadi phone` (details below).

## Phone mode

The native app runs in Expo Go on a phone on the same Wi-Fi as the laptop
([ADR-0022](adr/0022-phone-mode.md)). The stack then answers as `https://dev.raadiso.com`
(`PHONE_DOMAIN`), with a Let's Encrypt certificate the phone already trusts.

1. **Once:** at <https://developer.godaddy.com/keys>, create a Personal Access Token with the scopes
   `domains.domain:read` and `domains.dns:update`. Then store it from your own terminal. The input is hidden,
   and the token never goes into the repository or a chat:

   ```bash
   ./raadi secret-set godaddy_pat
   ```

2. **Each time:** `./raadi phone`. This:
   - points `dev.raadiso.com` and `*.dev.raadiso.com` at the laptop's current LAN address (private
     addresses only, and only when they changed);
   - gets or renews the wildcard certificate with a DNS-01 challenge (nothing is exposed to the internet);
   - starts the stack on the LAN address and Metro on port 8081.

   The first certificate takes a minute or two while the challenge record propagates.

3. On the phone, install **Expo Go**, open it and enter `exp://<laptop LAN address>:8081` (printed by
   `./raadi phone`). Sign in with a demo user.
4. Back to the normal setup: `./raadi up`. The certificate and Keycloak's URLs switch back to
   `raadi.localhost` on their own.

Notes:

- While phone mode runs, the stack (with its demo passwords) is reachable from your LAN. Use it on a
  network you trust.
- Some routers block DNS answers that point at private addresses ("DNS rebinding protection"). If the
  phone cannot resolve `dev.raadiso.com`, allow the domain in the router's settings, or set the phone's
  DNS to a public resolver.
- Metro runs in a container, where file changes on the host don't always arrive. After editing app code,
  reload in Expo Go (shake → Reload) or run `./raadi restart expo`.

## Layout

```text
apps/mobile/src/app/          Expo Router screens: (tabs)/ home, search, messages, account; listings/[id],
                              messages/[id], my-listings, auth, +not-found
apps/mobile/src/components/   ui.tsx (Fjord Glass primitives), listing-card.tsx, no-photo.tsx
apps/mobile/src/lib/          api (typed clients, useLoad, usePaged), auth (provider.tsx for web,
                              provider.native.tsx for devices), realtime (one shared WebSocket), storage
apps/mobile/src/theme.tsx     palettes, fonts and the System / Light / Dark preference
apps/mobile/src/i18n/         nb / en / so catalogue (wording follows apps/web/messages)
apps/mobile/server/serve.mjs  static server for the web export
```

## Checks

- `./raadi lint typecheck test` covers the app (package `mobile`).
- `./raadi smoke` checks that `/m/` serves the app shell with its own CSP, the JavaScript bundle and client
  routes.
- `./raadi e2e e2e specs/mobile.spec.ts` drives the web build at phone size: search, a listing, sign-in,
  My listings and logout.

## Things to know

- On the web, never hand a style **array** to `expo-image`, or to a `Pressable` inside `Link asChild`.
  react-native-web spreads it into the DOM as `{0: …}`. Pass one merged object instead.
- react-native-web leaves a `TextInput` statically positioned, so absolutely positioned siblings paint over
  it. The `Glass` backdrop layers therefore sit at `zIndex: -1` with `pointerEvents="none"`.
- Text fields show focus with their container's accent border, and `noFocusRing` removes the browser
  outline. Chromium ignores `outline-width` when `outline-style` is `auto`.
- `patches/expo-router@57.0.24.patch` fixes the `/m` base path for routes starting with "m". Check it
  whenever Expo is upgraded.
- Expo pins React Native and React. Install versions from Expo's bundled-module list, not the latest ones.
