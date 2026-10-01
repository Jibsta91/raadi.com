# 0009 — OSI-only licensing policy

- Status: Accepted
- Date: 2026-10-01

## Decision

- Every component must be under an OSI-approved license. No BSL, SSPL, "source-available" or paid SaaS
  dependencies. Examples: Redis → **Valkey** (BSD), Vault → **OpenBao** (MPL-2.0), Terraform → **OpenTofu**
  (MPL-2.0), MinIO → **SeaweedFS** (Apache-2.0).
- AGPL-3.0 components (Grafana, Loki, Tempo) run **unmodified as separate network services**. That is compliant,
  and their source is publicly available.
- `./raadi licenses` (CI gate) fails on npm dependencies without an OSI license. Data-only packages under
  CC licenses (e.g. `caniuse-lite`) are explicitly allow-listed. Python dependencies get the same check in Phase 4.
- Projects with an OSI core plus separately licensed "enterprise" directories (e.g. Langfuse, LiteLLM) are used only
  in their OSI-licensed form, with enterprise features disabled. Each is noted in the ADR that introduces it.

## Consequences

The whole platform can be run, modified and redistributed without commercial licenses.
