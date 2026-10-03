# Changelog

Notable changes per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/) as described in [docs/releasing.md](docs/releasing.md).
Each release also has generated notes on GitHub.

## [Unreleased]

### Added

- `./raadi dns` and `./raadi cert` manage raadiso.com through GoDaddy's DNS API: A records for a server, and a
  Let's Encrypt wildcard certificate by DNS-01, ready for production (ADR-0023, docs/domain.md).
- Phone mode: `./raadi phone` serves the stack to a phone on the same Wi-Fi as `https://dev.raadiso.com`,
  with LAN DNS through GoDaddy, a Let's Encrypt certificate (DNS-01) and Metro for Expo Go (ADR-0022).
  `./raadi secret-set` stores secrets you supply, behind a hidden prompt.
- App icons (iOS, Android adaptive, web) and a website favicon.
- Mobile app (Expo): home, search, listings, live chat, my listings and account, signing in with OIDC + PKCE
  on devices and through the BFF session in its web build, served under `/m` (ADR-0021).
- "Fjord Glass" look for the app and the website, with bundled fonts and a System / Light / Dark setting
  (the website renders the chosen theme on the server, so pages never flash).

### Changed

- The product is now called **Raadiso**, after its domain raadiso.com: web, app, e-mails, login pages and
  receipts. Code keeps the working name `raadi` (ADR-0023).
- The login and e-mail theme uses the Fjord Glass colours.
- My listings, notifications and profile reviews use the rounded card lists, and unread notifications are
  marked with a dot.
- The website's header has category links and an account menu (My listings, Account, Log out); language and
  appearance moved to the footer.
- Logging out accepts a `returnTo` path, like logging in.

### Fixed

- The native app's requests were rejected (401): the gateway dropped its bearer token when there was no browser
  session. Demo users also lacked `offline_access`, so the app could not stay signed in.
- The identity BFF could reuse a spent refresh token when two requests refreshed at once.

## [0.3.0-alpha.2] — 2026-10-02

Phase 3: payments for promoted listings.

### Added

- Payments: promoted listings (7 or 30 days) paid through provider adapters for Vipps ePayment and Stripe
  Checkout, with idempotent orders, signed webhooks processed exactly once, reconciliation and admin refunds
  (ADR-0020). A Vipps-compatible mock provider runs in development.
- Promoted listings rank first in search and carry a "Promoted" badge; buyers get a receipt e-mail.

### Fixed

- OpenBao's first boot could lose the unseal key on a slow host, because initialisation timed out.

## [0.3.0-alpha.1] — 2026-10-02

Phase 3 so far: messaging, notifications, reviews and trust, and sign-up.

### Added

- Messaging between buyers and sellers, with live delivery over WebSockets (ADR-0016).
- Notifications: queued, throttled e-mail and in-app notices, with an e-mail preference (ADR-0017).
- Reviews and trust: reviews only after a sale between both parties, public trust profiles, BankID
  verification over OIDC with a mock provider in development (ADR-0018).
- Sign-up: Raadi-branded registration, password set after e-mail confirmation, common-password list, terms
  of use, welcome page (ADR-0019).
- Repository: protected `main` (pull requests, required CI, signed commits), issue forms, Playwright MCP for
  AI coding sessions.

### Changed

- Every pinned dependency was upgraded to its newest stable release.
- Event schemas are registered as JSON Schema draft-07, so the registry's compatibility checks work.

### Fixed

- Client-side navigation stalled under parallel load because header links prefetched every page.

## [0.2.0] — 2026-10-01

Phase 2: listings, search (OpenSearch), media (virus-scanned, re-encoded images), authorization (OpenFGA +
OPA), the Kafka event backbone with Debezium outbox, and the web app for browsing, searching and selling.

## [0.1.0] — 2026-10-01

Phase 1: the foundation. A one-command compose stack, Keycloak, OpenBao, the Traefik gateway, the
identity-bff token handler, observability (OpenTelemetry, Prometheus, Loki, Tempo, Grafana), the web shell
in three languages, the toolbox, smoke and e2e tests, and CI.

[Unreleased]: https://github.com/Jibsta91/raadi.com/compare/v0.3.0-alpha.2...HEAD
[0.3.0-alpha.2]: https://github.com/Jibsta91/raadi.com/compare/v0.3.0-alpha.1...v0.3.0-alpha.2
[0.3.0-alpha.1]: https://github.com/Jibsta91/raadi.com/compare/v0.2.0...v0.3.0-alpha.1
[0.2.0]: https://github.com/Jibsta91/raadi.com/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Jibsta91/raadi.com/releases/tag/v0.1.0
