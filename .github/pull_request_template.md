## What and why

<!-- What changes, and the problem it solves. Link the roadmap item or issue. -->

## How it was verified

- [ ] `./raadi up` is green from a clean state (`docker compose down -v` first if the change touches init)
- [ ] `./raadi smoke` and `./raadi e2e` pass
- [ ] lint, typecheck, unit and integration tests pass
- [ ] licenses, security and iac-scan pass

## Checklist

- [ ] New decisions have an ADR
- [ ] Docs updated (README, development guide, runbooks) where behaviour changed
- [ ] No secrets, tokens or personal data in code, logs or events
