# 0008 — Database per service, dbmate migrations, transactional outbox

- Status: Accepted
- Date: 2026-10-01

## Decision

- One PostgreSQL 17 instance (PostGIS + pgvector, `wal_level=logical`) with **one database and one login role
  per service**. `PUBLIC` is revoked, so no service can read another's data. Moving a database to a managed
  service changes only connection settings.
- Migrations are plain SQL run by **dbmate** (language-agnostic, also used by the Python services) from the
  `db-init` init container. The init image bakes in every `services/*/migrations` folder.
- Events use the **transactional outbox**. State change and event row (CloudEvents 1.0 envelope, ids rather than
  personal data) commit in one transaction. From Phase 2, Debezium streams the outbox to Kafka, consumers are
  idempotent (dedupe on event id) and retries use exponential backoff.

## Consequences

No dual writes, no lost events. Outbox rows written before Phase 2 are picked up by Debezium's initial snapshot.
