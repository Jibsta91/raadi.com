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

   For an **iPhone** you also need a free Expo account: since Expo Go 57, Expo Go on a physical iPhone
   opens only projects served by an Expo CLI signed in to the same account. Create an access token at
   expo.dev (Account settings → Access tokens), store it with `./raadi secret-set expo_token`, and sign in
   to Expo Go with that account. Without the token, Metro stays offline (Android and simulators still work).

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
- Fedora's firewall blocks ports 80 and 443 from the network by default. Open them for this session with
  `sudo firewall-cmd --add-service=http --add-service=https`.
- Some routers block DNS answers that point at private addresses ("DNS rebinding protection"). If the
  phone cannot resolve `dev.raadiso.com`, allow the domain in the router's settings, or set the phone's
  DNS to a public resolver.
- Metro runs in a container, where file changes on the host don't always arrive. After editing app code,
  reload in Expo Go (shake → Reload) or run `./raadi restart expo`.

## Push notifications

After sign-in the app asks for permission and registers its Expo push token with the notifications
service (ADR-0025). New messages, removed listings, reviews and promotions then arrive as pushes, and
tapping one opens the right screen. The switch on the account screen (and on the website's notifications
page) turns message pushes off.

- **Development:** pushes go to push-mock, never to a phone. See what was sent at
  `http://push.raadi.localhost/messages`.
- **On a real iPhone** (Expo Go): send through Expo's push service:
  `PUSH_URL=https://exp.host/--/api/v2/push/send ./raadi phone`. The project must be linked
  (`EAS_PROJECT_ID`, see above). Expo Go on Android cannot receive remote pushes; use a development build.
- Signing out removes the phone's token; uninstalling the app makes Expo report it, and the token is deleted.

## Layout

```text
apps/mobile/src/app/          Expo Router screens: (tabs)/ home, search, messages, account; listings/[id],
                              messages/[id], my-listings, auth, +not-found
apps/mobile/src/components/   ui.tsx (Fjord Glass primitives), listing-card.tsx, no-photo.tsx
apps/mobile/src/lib/          api (typed clients, useLoad, usePaged), auth (provider.tsx for web,
                              provider.native.tsx for devices), realtime (one shared WebSocket), storage,
                              push (push.native.tsx registers the device; push.tsx is the web no-op)
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
