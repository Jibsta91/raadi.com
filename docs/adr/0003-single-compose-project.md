# 0003 — One Compose project for laptop and cloud

- Status: Accepted
- Date: 2026-10-01

## Context

`git clone && docker compose up` must start the whole platform with Docker as the only prerequisite, and the same
images must run in the cloud. Kubernetes is out of scope for now.

## Decision

- `compose.yaml` only `include`s slices in `deploy/compose/*.yaml` (init, core, identity, gateway, observability,
  apps, tools). Each include sets `project_directory: .`, so all paths are relative to the repository root.
- Overlays: `compose.dev.yaml` (hot reload: bind mounts + named `node_modules` volumes) and `compose.prod.yaml`
  (Phase 5: registry images, Let's Encrypt, no dev tools). Overlays use `!reset` / `!override` where needed.
- **Init containers** are one-shot, idempotent and run on every `up`. They handle secrets, dev TLS, OpenBao
  bootstrap, databases and migrations, the Keycloak realm, and the startup summary. Order uses
  `depends_on: condition: service_healthy | service_completed_successfully`.
- Every image is pinned to an exact tag (distroless base by digest). Locally built images use
  `pull_policy: build`, so `docker compose up` always runs current code (BuildKit cache keeps it fast).
- Heavy optional extras go into profiles: `tools` (toolbox), `test` (smoke, e2e), `full` (later phases). The
  default profile is a fully working app.
- All bootstrap logic is baked into the `raadi-init` image (scripts, migrations, realm template). Production
  servers then need only the compose files, `deploy/` configuration and `.env`.

## Consequences

- Same artifacts everywhere. Local vs cloud differences live only in `.env` and overlays.
- Changes to bind-mounted configuration (e.g. `deploy/traefik/dynamic`) may not trigger file watchers through
  Docker Desktop's file sharing. Run `./raadi restart traefik` after editing.
