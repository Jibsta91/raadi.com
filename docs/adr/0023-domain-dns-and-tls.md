# 0023 — Domain, DNS and TLS: raadiso.com at GoDaddy, Let's Encrypt by DNS-01, brand "Raadiso"

- Status: Accepted
- Date: 2026-10-03

## Decision

- **The product is called Raadiso**, matching its domain, **raadiso.com**. The brand appears wherever
  people see the product: web, app name, e-mails, Keycloak's login and e-mail theme, receipts and the payment
  mock's page. The code keeps the working name `raadi` (packages, the `./raadi` command, the Keycloak realm,
  databases, images and internal headers), so the rename touches no identifiers. In Somali, "raadi" is also
  the verb "search", and those strings stay as they are.
- **DNS stays at GoDaddy, the registrar.** `./raadi dns` manages records through GoDaddy's DNS records API
  (v3) with a scoped Personal Access Token (`domains.domain:read`, `domains.dns:update`). The token is
  stored with `./raadi secret-set godaddy_pat`. The command writes only the zone's `@` and `*` A records,
  accepts only public addresses, and offers `--dry-run`.
- **Certificates come from Let's Encrypt with DNS-01** (lego with its `exec` provider calling
  `godaddy-acme.sh`; lego's GoDaddy provider supports only the older key and secret). Each certificate is a
  wildcard plus its apex. The server needs no inbound port 80 for validation, and the same job serves phone
  mode (`dev.raadiso.com`, ADR-0022) and production (`raadiso.com`). Renewal runs when fewer than 30 days
  remain. The certificate is installed as Traefik's default certificate, so Traefik's static configuration is
  the same in every environment.
- **One zone variable**, `DNS_ZONE` (default `raadiso.com`), scopes every DNS change. Writes outside the
  zone are refused.

## Alternatives considered

- **Moving DNS to another provider (Cloudflare, Route 53)**: Traefik and lego support them natively, but it
  adds an account and a migration. GoDaddy's API has served one-domain accounts since April 2026.
- **Traefik's built-in ACME**: its GoDaddy provider needs the older key and secret, its `exec` provider
  would need curl and jq in the Traefik image, and certificates would differ per environment.
- **HTTP-01 challenges**: need port 80 reachable from the internet and cannot issue wildcards.
- **A full rename to "raadiso" in code**: churns every package, image and database name for no user-visible
  gain, and needs a data migration.

## Consequences

- The production server (Phase 5) needs the GoDaddy token and a daily `./raadi cert --install` with a
  Traefik restart when the certificate changes. Ansible owns that timer.
- A token with DNS write access is a sensitive secret: keep it in the secrets volume only, rotate it at
  GoDaddy, and revoke it if it leaks.
- Until `./raadi dns` runs with a server address, raadiso.com keeps GoDaddy's parking page.
