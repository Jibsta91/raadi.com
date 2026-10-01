# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/Jibsta91/raadi.com/security/advisories/new). Do not open
a public issue. Include the affected component, steps to reproduce and the impact you expect. You will get an
acknowledgement within five working days.

## Supported versions

Only the `main` branch is supported. Fixes are not backported.

## Scope and design

The threat model is in [docs/threat-model.md](docs/threat-model.md). Security-relevant decisions are recorded
as [ADRs](docs/adr/README.md). The development `.env` is committed on purpose and contains no secrets: every
credential is generated on first boot (see [ADR-0005](docs/adr/0005-secrets-bootstrap-openbao.md)). Reports
about the public demo password `raadi-demo-pass` are out of scope; seed users exist only in development.
