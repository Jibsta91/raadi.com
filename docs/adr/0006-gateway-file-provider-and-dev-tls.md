# 0006 — Traefik with file provider, `*.localhost`, local dev CA

- Status: Accepted
- Date: 2026-10-01

## Context

The gateway needs TLS, routing, rate limits and security headers. Mounting the Docker socket into an
internet-facing proxy gives an attacker root on the host.

## Decision

- Traefik's routes live in `deploy/traefik/dynamic/**` (file provider, Go templates over `RAADI_DOMAIN`). There
  are **no Docker labels and no Docker socket**. Traefik runs as UID 65532, read-only, with no capabilities, and
  binds 80/443 through the `net.ipv4.ip_unprivileged_port_start` sysctl.
- Dev-only routes (Traefik dashboard, Mailpit, OpenBao UI, Prometheus) are in `dynamic/dev/`, which production
  doesn't mount.
- Hostnames use `*.raadi.localhost`, which resolves to loopback without editing the hosts file.
  `certs-init` generates a dev CA and a wildcard certificate inside a container, so HTTPS works and trusting the
  CA is optional (`./raadi ca-cert`). Plain HTTP also works. Production uses Let's Encrypt (Phase 5).
- Middlewares: HSTS, nosniff, frame-deny, referrer and permissions policies, CSP for the web app, per-IP
  token-bucket rate limits (stricter on `/auth`), compression, `forwardAuth`. Entry points delete aliasing
  headers and reject encoded `/`, `\` and NUL in paths.

## Consequences

- Adding a service means adding a router in `routes.yml` (explicit, reviewable) instead of labels.
- CrowdSec bouncer and the Coraza WAF (OWASP CRS) plug in as middlewares in Phase 6.
