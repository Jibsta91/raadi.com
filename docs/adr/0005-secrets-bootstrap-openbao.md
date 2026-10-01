# 0005 — First-boot secrets, OpenBao AppRole, single-key unseal

- Status: Accepted
- Date: 2026-10-01

## Context

No secret may be committed to Git or baked into images, yet `docker compose up` must work with zero manual
steps, locally and on a fresh VM.

## Decision

- `secrets-init` generates every secret (256-bit random, `deploy/init/manifest.json` is the inventory) on first boot
  only. They go to the `secrets` volume in development, or `${DEPLOY_DIR}/secrets` (chmod 700) in production.
- Infrastructure that can't talk to OpenBao (Postgres, Valkey, Keycloak, Grafana, the collector) gets
  read-only per-consumer copies. Each copy is owned by that container's UID and mounted via volume `subpath`.
- **Applications read secrets only from OpenBao.** `openbao-bootstrap` enables KV v2 and AppRole, writes
  `secret/raadi/<service>`, and creates one least-privilege policy and AppRole per service. The
  `role_id`/`secret_id` go into a per-service directory, readable only by that service's UID.
- OpenBao uses integrated (raft) storage. `openbao-unsealer` initialises it on first boot with **one key share**
  and re-unseals it after restarts.

## Consequences

- Zero manual steps and no secrets in Git, images or environment variables.
- **Trade-off:** the unseal key lives on the same host as the data, which protects against secret sprawl but not
  against full host compromise. For stronger guarantees, switch the seal to a KMS/transit auto-unseal or keep
  the unseal key off-box (documented in `docs/runbooks/openbao.md`). The root token is kept for bootstrap;
  revoking it after bootstrap is part of Phase 6 hardening.
- Rotation: delete a secret's master file and re-run `up` (see the runbook), or use OpenBao directly.
