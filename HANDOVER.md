# Handover: Phase 2 in progress (2026-10-01)

Read `CLAUDE.md`, `docs/roadmap.md` and `docs/development.md` first. This file describes where Phase 2
stopped. Delete it when Phase 2 is done.

## State of `main`

| Commit    | What                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `a3d3165` | Phase 1 baseline                                                                         |
| `b567173` | Repo tidy (deploy/docker/, community files)                                              |
| `9528740` | Kafka KRaft (SCRAM + ACLs), Debezium outbox CDC, `@raadi/catalog`                        |
| `48a91d9` | SeaweedFS, imgproxy, ClamAV, OpenSearch, OpenFGA, OPA, Apicurio, template rendering      |
| `adf7cd8` | `@raadi/events`, service-kit building blocks, listings service                           |
| `4ad7d3b` | media and search services, seeders, gateway routes. **Last verified commit** (cold `up` green, smoke 39/39) |

## Uncommitted work (on disk, not yet verified end to end)

- **Web UI:** search page with facets, geo and sort (`apps/web/src/app/[locale]/search`); listing detail;
  new and edit forms with image upload; my listings; header and home updates; nb/en/so messages; status page
  entries. Typecheck, lint and unit tests passed, and Playwright screenshots looked right.
- **api-client:** typed clients for listings, search and media (`pnpm --filter @raadi/api-client generate`).
- **media:** `services/media/openapi.yaml` plus a contract test (passes).
- **Smoke test:** new sections in `tests/smoke/smoke.sh` (event backbone, search, listings/media/authz) and a
  `login_as` helper. **Never run.** It uses the fixture `tests/fixtures/images/listing.jpg`, which the
  init Dockerfile copies to `/opt/raadi/fixtures/`.

Next step: `docker compose build init && ./raadi smoke`. Fix whatever fails, especially the EICAR `printf`
escaping and the `bash -c` strings inside `eventually`. Then run lint, typecheck and test, and commit.

## Remaining Phase 2 work

1. **Playwright e2e** (`tests/e2e/specs/`): browse (home → category → facet → detail), search (query,
   sort), and create listing as `amina.hassan@` (upload the fixture JPEG, publish, my listings, mark
   sold, delete). Elements carry `data-testid`s.
2. **Observability:**
   - Add the OTel `kafkametrics` receiver (SCRAM user `monitor`; secret already in the `otel-collector`
     consumer) for consumer lag.
   - Add Prometheus scrape targets: imgproxy `:8081`, openfga `:2112`, seaweedfs `:9327`,
     apicurio `:9000/metrics`, opa `:8181/metrics`.
   - Add a Grafana "Marketplace" dashboard. The metrics are `raadi_listings_written`,
     `raadi_search_index_lag`, `raadi_media_uploads`, `raadi_events_consumed`.
   - Add alerts for DLQ growth and consumer lag.
3. **Dev hot reload:** add `compose.dev.yaml` overrides for listings, media and search, like identity-bff.
4. **ADRs:** 0012 event backbone (outbox, Debezium raw-JSON payload, Apicurio BACKWARD rules), 0013
   authorization (OpenFGA tuples + OPA rules, fail closed), 0014 media pipeline (ClamAV, imgproxy
   re-encode, signed URLs, orphan GC), 0015 search (external versioning, facets). Also update ADR-0011
   with measured memory (`docker stats`): new services add about 3.3 GB (ClamAV ~950 MB,
   OpenSearch ~710 MB, Connect ~480 MB, Kafka ~330 MB).
5. **Docs:** README (services/ports table, architecture diagram), `docs/architecture/c4-container.md`,
   `docs/development.md` (new packages/services, layout), threat model, roadmap status → Done.
6. **Gates:** `./raadi licenses`, `security` and `iac-scan`, plus integration tests for listings and
   search (Testcontainers; listings builds `deploy/postgres`). Push and check that CI is green: the CI
   runner must fit the bigger stack in `--wait-timeout 900`.

## Gotchas found this session

- **Debezium:** the outbox payload must be forwarded as raw JSON text (`StringConverter`,
  `expand.json.payload=false`). Expanding it dropped `null` fields and broke the contracts.
- **ClamAV healthcheck:** probe `127.0.0.1`, not `localhost`. `localhost` resolves to `::1`, and clamd
  listens on IPv4 only.
- **OpenSearch plugins:** plugins depend on each other, so the Dockerfile removes them in passes.
- **OpenFGA model comparison:** OpenFGA echoes back `"object": ""`; `authz-init` normalises it before
  comparing models.
- **kafka-init speed:** it is slow (one JVM per CLI call), so it skips the work using a fingerprint
  stored in the `kafka-init-state` volume.
- **Seeding:** demo users have fixed Keycloak ids (`packages/catalog/src/demo.ts`). `keycloak-init`
  recreates demo users that have random ids.
- **Commit signing** uses 1Password. If it is locked, `git commit` fails with "failed to fill whole
  buffer". Ask the user to unlock it; don't disable signing.
- **Small cleanups:**
  - pino `autoLogging.ignore` still logs `/readyz`.
  - identity-bff has its own `HealthController` (service-kit now has one).
  - media handles `listing.deleted` by passing a dummy owner id.
