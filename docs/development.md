# Development guide

Prerequisites: **Docker** (Desktop, or Engine + Compose v2) and **Git**. Every other tool runs in containers.

## Run modes

| Mode       | Command                                                                 | Use it for                                           |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Normal     | `docker compose up` (or `./raadi up`)                                   | Running the platform exactly as production images do |
| Hot reload | `./raadi dev` (`docker compose -f compose.yaml -f compose.dev.yaml up`) | Editing web or service code with instant reload      |
| Toolbox    | `./raadi toolbox` (`docker compose run --rm toolbox bash`)              | pnpm, uv, tofu, ansible, checkov, trivy, playwright… |

In hot-reload mode the repository is bind-mounted at `/workspace`. `node_modules` and the pnpm store live in
named volumes (`nm-*`, `pnpm-store`) shared with the toolbox, so nothing platform-specific is written to your
machine. File watching uses polling, so edits made on macOS/Windows/Docker Desktop are picked up (web ≈ 3 s,
services ≈ 10 s).

After editing gateway configuration (`deploy/traefik/**`), run `./raadi restart traefik`. File-change events
don't always cross Docker Desktop's file sharing.

## Repository layout

```
apps/web                 Next.js 16 (App Router, RSC), next-intl (nb/en/so), Tailwind 4, shadcn/ui-style components
apps/mobile              Expo app (Phase 3)
services/identity-bff    NestJS: OIDC login, encrypted sessions, token handler, /api/v1/identity
services/*               further domain services (Phase 2–3)
ai/*                     Python AI pillars (Phase 4)
packages/service-kit     telemetry, logging, OpenBao, JWT guard, errors, resilience, health, shutdown
packages/api-client      typed client generated from services' OpenAPI contracts
packages/ui              design-system components
packages/config          shared tsconfig and ESLint presets
deploy/compose/*.yaml    compose slices included by compose.yaml
deploy/init              raadi-init image: bootstrap scripts + secrets/DB manifest
deploy/{traefik,keycloak,openbao,postgres,otel,observability,toolbox,images}
infra/{tofu,ansible,cloud-init}  (Phase 5)
tests/{smoke,e2e,licenses}
docs/                    architecture, ADRs, threat model, runbooks
```

## Tests

| Kind                                    | Where                                              | Command                    |
| --------------------------------------- | -------------------------------------------------- | -------------------------- |
| Unit + contract                         | `**/test/unit`, `packages/*/test`, `apps/web/test` | `./raadi test`             |
| Integration (Testcontainers)            | `services/*/test/integration`                      | `./raadi test-integration` |
| Smoke (full stack, through the gateway) | `tests/smoke/smoke.sh`                             | `./raadi smoke`            |
| End-to-end (Playwright, Chromium)       | `tests/e2e/specs`                                  | `./raadi e2e`              |

Contract tests validate controller output against the service's `openapi.yaml`, the same document that
generates `@raadi/api-client` (`./raadi generate`).

## Adding a NestJS service (checklist)

1. `services/<name>/` with `package.json` (`build`, `dev`, `test`, `lint`, `typecheck` scripts), `openapi.yaml`,
   `src/telemetry.ts` (calls `startTelemetry`), `src/main.ts` modelled on identity-bff.
2. Use `@raadi/service-kit`: `JwtAuthGuard` (global), `ProblemDetailsFilter`, `RouteSpanInterceptor`,
   `ZodValidationPipe`, `HealthRegistry` + `installGracefulShutdown`, `OpenBaoClient` for secrets.
3. Register it in `deploy/init/manifest.json` (UID, database, extensions, OpenBao secrets). `secrets-init`,
   `openbao-bootstrap` and `db-init` pick it up automatically. Put SQL migrations in `migrations/` (dbmate format).
4. Add the compose service in `deploy/compose/apps.yaml` (build with `deploy/images/node-service/Dockerfile`,
   `SERVICE=<name>`) and a router in `deploy/traefik/dynamic/common/routes.yml` with the `forward-auth` middleware.
5. Add `nm-<name>` volumes to `deploy/compose/tools.yaml` and `compose.dev.yaml`.
6. Extend the smoke test and the Grafana dashboards. Write an ADR if a decision was involved.

## Conventions

- Logs: one JSON object per line (`level`, `time`, `service`, `msg`, `trace_id`). Never log tokens or personal data.
- Errors: RFC 9457 `application/problem+json`.
- Events: CloudEvents 1.0 written to the service's `outbox` table in the same transaction as the state change.
- Config: environment variables (validated with zod at startup). Secrets come only from OpenBao.
- Versions: exact pins everywhere. Renovate proposes upgrades ([ADR-0010](adr/0010-pinned-versions.md)).
