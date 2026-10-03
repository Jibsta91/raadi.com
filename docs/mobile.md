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
- **On a phone** (not wired up yet): the native app signs in with OIDC + PKCE against the `raadi-mobile`
  Keycloak client. It needs an Expo dev server reachable from the phone, and the stack reachable on the
  laptop's LAN address over TLS (Keycloak cookies need HTTPS off `localhost`). That containerized dev server
  (a compose profile on port 8081) is the next slice.

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
