# 0002 — TypeScript (NestJS) for domain services, Python for AI

- Status: Accepted
- Date: 2026-10-01

## Context

The brief allows NestJS or Go for domain services, provided we stay consistent. The web app (Next.js) and the
mobile app (Expo) are TypeScript. AI services need the Python ML ecosystem (Presidio, scikit-learn, Dagster,
MLflow).

## Decision

- Domain services use **TypeScript on NestJS 12** with the Fastify adapter, ESM, and Node.js 24 LTS.
- AI services use **Python 3.13 + FastAPI + Pydantic v2**, managed by a `uv` workspace.
- Cross-cutting concerns for Node services live in `@raadi/service-kit`: OpenTelemetry bootstrap, pino JSON
  logging with redaction, OpenBao client, JWT verification guard, RFC 9457 errors, zod validation, retries,
  circuit breakers (opossum), health/readiness and graceful shutdown.
- Contracts are **contract-first OpenAPI 3.1** documents per service (`services/*/openapi.yaml`). The typed client
  `@raadi/api-client` is generated from them and shared by web and mobile. Contract tests check controller
  output against the document.

## Consequences

- One language across web, mobile and domain services. DTO/types are shared and engineers can move between them.
- Node services use ~100 MB of RAM each, against ~20 MB for Go. That's acceptable within the [resource budget](0011-resource-budget.md).
- NestJS DI relies on `emitDecoratorMetadata`, so constructor dependencies must be **value** imports (not
  `import type`). Services compile with `tsc` (not esbuild/tsx) for that reason.
