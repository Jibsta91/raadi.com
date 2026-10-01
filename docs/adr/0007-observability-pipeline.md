# 0007 — OpenTelemetry everywhere through one collector

- Status: Accepted
- Date: 2026-10-01

## Decision

- Every service exports **traces, metrics and logs over OTLP** to one OpenTelemetry Collector. The collector
  forwards to Tempo (traces), Prometheus' native OTLP receiver (metrics) and Loki's OTLP endpoint (logs). It
  also scrubs credentials and scrapes Postgres and Valkey.
- Node services preload the SDK (`node --import …/telemetry.js`) so that http, pg, pino, undici and Nest are
  instrumented. pino logs carry `trace_id`/`span_id` and are sent as OTel logs while still being printed as
  JSON on stdout.
- Next.js: the SDK is **preloaded outside the Next bundle** (`node --import /otel/dist/preload.js server.js`).
  Turbopack's standalone output doesn't ship externals such as `require-in-the-middle`, so bundling the SDK
  breaks at runtime.
- Traefik sends traces and access logs over OTLP. Keycloak sends traces. Tempo's metrics generator produces
  RED metrics and the service graph.
- Grafana ships with provisioned datasources (trace↔log↔metric links), dashboards (overview, gateway,
  services, data stores) and alerting. Prometheus rules route through Alertmanager (e-mail; Mailpit in dev).

## Consequences

One pipeline to secure and scale, and vendor-neutral (any OTLP backend can replace the Grafana stack).
Infrastructure containers without OTLP support still log to stdout (`docker compose logs`).
