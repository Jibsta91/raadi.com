# 0011 — 16 GB laptop resource budget and profiles

- Status: Accepted
- Date: 2026-10-01

## Decision

Every container has a memory limit (`deploy.resources.limits`). Go services also get a `GOMEMLIMIT` and the
JVM a `MaxRAMPercentage`, so they stay under their limits. The default profile must leave room for the host OS,
an IDE and a browser on a 16 GB laptop (Docker Desktop with ~8–10 GB).

| Phase | Measured steady-state RSS (default profile)                      |
| ----- | ---------------------------------------------------------------- |
| 1     | ≈ 1.9 GB across 15 containers (Keycloak ≈ 600 MB is the largest) |

Later phases add Kafka, OpenSearch and Ollama, the expensive ones. They get tight limits and small defaults (a
3–4B instruct model, small JVM heaps). Heavy extras (OpenMetadata, full lakehouse) are under `--profile full`.

## Consequences

Each phase measures and updates this table. A phase that breaks the budget must move something behind a profile.
