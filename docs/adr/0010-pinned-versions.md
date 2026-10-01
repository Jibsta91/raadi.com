# 0010 — Version pinning and deliberate version choices

- Status: Accepted
- Date: 2026-10-01

## Decision

Everything is pinned to exact versions (images by tag, distroless by digest, npm with `save-exact`, CLI tools
with checksum verification in the toolbox). Renovate proposes upgrades. Deliberate choices that deviate from
"latest":

| Component      | Pinned  | Why not latest                                                                             |
| -------------- | ------- | ------------------------------------------------------------------------------------------ |
| Node.js        | 24 LTS  | Active LTS (odd/newer lines aren't LTS)                                                    |
| TypeScript     | 6.0     | typescript-eslint supports `<6.1`; TS 7 (Go port) not yet supported by the lint toolchain  |
| pnpm           | 10.x    | Proven `deploy`/`inject-workspace-packages` behaviour used by our Dockerfiles              |
| Tempo          | 2.10    | Monolithic single-binary mode for laptops. Re-evaluate 3.x's architecture before upgrading |
| OTel Collector | 0.161.0 | Latest published multi-arch release at the time of writing                                 |
| PostgreSQL     | 17      | Required by the brief; PostGIS 3.6 + pgvector 0.8.6                                        |

## Consequences

Builds are reproducible, and upgrades are explicit PRs with CI evidence.
