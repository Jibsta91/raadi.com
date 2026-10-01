# 0012 — Event backbone: Kafka, Debezium outbox, Apicurio contracts

- Status: Accepted
- Date: 2026-10-01

## Decision

- **Kafka 4 in KRaft mode** (single combined broker/controller in dev, Apache-2.0). Clients authenticate with
  **SASL/SCRAM-SHA-512**, one principal per client (`connect`, `search`, `media`, `monitor`). The authorizer
  denies by default and `kafka-init` grants each principal only its topics and consumer groups. The controller
  listener is bound to loopback.
- Services **never produce to Kafka directly**. They write CloudEvents to their own `outbox` table in the same
  transaction as the state change ([ADR-0008](0008-database-per-service-and-outbox.md)). One **Debezium**
  PostgreSQL connector per database (Kafka Connect, `pgoutput`, publication limited to `public.outbox`) routes
  rows with the outbox `EventRouter` to `raadi.<aggregate>.events`, keyed by aggregate id. That keeps
  per-aggregate ordering within a partition.
- The payload is forwarded as the **exact JSON text** the service wrote (`StringConverter`,
  `expand.json.payload=false`). Expanding it into a Connect schema dropped `null` fields and broke the
  contracts. The event type and W3C `traceparent` travel as Kafka headers, so traces continue across the
  broker.
- Event contracts are **zod schemas in `@raadi/events`**. JSON Schemas generated from them are registered in
  **Apicurio Registry 3** (Apache-2.0) by `registry-init`, with global `COMPATIBILITY=BACKWARD` and
  `VALIDITY=FULL` rules. A breaking change fails at deploy time, not in a consumer. The registry requires
  OIDC client credentials for writes. Reads are open on the internal network.
- Consumers (`service-kit/kafka`) are at-least-once and **idempotent** (they dedupe on event id or use
  aggregate versions). Transient failures are retried in place with exponential backoff (250 ms → 30 s), so
  ordering is kept. A `PermanentEventError` (invalid contract, impossible reference) sends the event to
  `raadi.dlq` with the error in headers, and processing continues.

## Alternatives considered

- **Redpanda**: BSL-licensed, so excluded by [ADR-0009](0009-open-source-licensing-policy.md).
- **Confluent Schema Registry**: Confluent Community License, not OSI.
- **Polling publisher** (services read their own outbox): simpler, but each service would need Kafka
  credentials and a poller. Debezium reads the WAL once per database with no polling load.

## Consequences

Kafka, Connect and Apicurio add about 1 GB of memory ([ADR-0011](0011-resource-budget.md)). `kafka-init`
starts one JVM per CLI call, so it fingerprints its desired state and skips the work when nothing changed.
Replication slots hold WAL while Connect is down; the `cdc_heartbeat` table keeps idle slots advancing.
Consumer lag and DLQ size are exported by the collector's `kafkametrics` receiver and alerted on.
