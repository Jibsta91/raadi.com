# Handover: Phase 3, payments slice (2026-10-02, end of session)

Read `CLAUDE.md`, `docs/roadmap.md` and `docs/development.md` first. This file is on branch
`feat/payments` and says where the work stopped. Delete it in the commit that finishes the payments slice.

## State

| Where                              | What                                                                                                                                     | Verified                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `main` (protected, PR only)        | Phase 3 slices: messaging, notifications, reviews/trust (#2), sign-up (#5); upgrades (#3), dev Playwright MCP (#4), release process (#6) | CI green on each PR                                                            |
| PR #7 `fix/openbao-init-timeout`   | Unsealer never times out `sys/init` (a slow first boot lost the unseal key, which made CI flaky)                                         | CI green, **not merged**: branch is behind `main`                              |
| Branch `feat/payments` (this file) | Payments slice, ADR-0020. Pushed, **no PR yet**, **not rebased** onto the latest `main`                                                  | Locally: smoke 118/118, e2e payments spec, 11 unit + 6 integration tests, lint |

`main` is protected: work on a branch, open a PR, and squash-merge once both CI jobs pass. Checks must run on a
branch that is up to date with `main` (`PUT /pulls/N/update-branch`). There is no `gh`; use the GitHub REST API
with a fine-grained PAT that the user provides each session (Administration, Contents and Pull requests
read/write). Never store the PAT in the repo or in memory.

## Payments slice: what exists on `feat/payments`

- `services/payments`: orders for promoted listings (`promote_7d` 49 kr, `promote_30d` 149 kr, in øre).
  It has:
  - a required `Idempotency-Key` on orders
  - a forward-only state machine (`model.ts`)
  - provider adapters for Vipps ePayment and Stripe Checkout
  - HMAC-verified webhooks, processed exactly once (`webhook_inbox`)
  - reconciliation every 30 s
  - full refunds for admins
  - outbox events `payment.captured` and `promotion.changed`
- `services/payments-mock`: a Vipps-compatible test PSP. Its hosted page is
  `http://pay.raadi.localhost/pay/<id>` (Approve, Decline, or Approve but lose the webhook). It sends every
  webhook twice and keeps state in memory. It runs in development only.
- `listings` consumes `promotion.changed` (new Kafka user `listings`, group `listings-promotions`, column
  `promoted_until`, `processed_events`). The snapshot and API gain an optional `promotedUntil`.
- `search` (INDEX_VERSION 2) ranks running promotions first under "relevance" (a `should` boost) and marks
  hits as `promoted`.
- `notifications` sends a receipt e-mail (price, 25 % VAT, date, seller from `RECEIPT_MERCHANT`) and an
  in-app `listing_promoted` notice.
- Web:
  - a "Promote" button for owners
  - `/listings/[id]/promote` and `/payments/[id]` (polls the order)
  - "Promoted" badges on cards and on the listing page
  - nb/en/so text
- Infra: manifest secrets and services, Kafka topics and ACLs, a gateway route (webhooks without
  forward-auth), the dev route `pay.<domain>`, compose services, alerts `PaymentsStuckOpen` and
  `PaymentWebhooksRejected`, and dashboard panels. `.env` has `PAYMENTS_PROVIDER`, `VIPPS_*`.
- Docs: ADR-0020, `docs/runbooks/payments.md`, README, C4, threat model, development guide.

## Next steps (in order)

1. **Merge PR #7:** call `update-branch`, wait for both checks, then squash-merge.
2. **Rebase `feat/payments` onto `origin/main`** (it was branched before sign-up and the release docs).
   - Expect conflicts in `apps/web/messages/*.json`, `docs/adr/README.md` (0019 and 0020 rows), `README.md`,
     `docs/threat-model.md`, `docs/roadmap.md`, `tests/smoke/smoke.sh`, `compose.dev.yaml`,
     `deploy/compose/*.yaml`, `apps/web/src/lib/status.ts` and `deploy/init/scripts/summary.sh`.
     Keep both sides of each.
   - Then run `./raadi generate` (event schemas and API client).
3. **Roadmap:** payments ✅. Move "Raadi MCP server" to Phase 5: the user decided it comes after the cloud
   deployment, since MCP clients need a public HTTPS endpoint. Next in Phase 3 is the Expo app.
4. **ADR-0011:** measure memory with `docker stats` (payments + payments-mock are about
   250 MB together).
5. **Run every gate:** `./raadi lint typecheck test test-integration licenses security iac-scan`. Then a
   cold start (`docker compose --profile tools --profile test down -v --remove-orphans && docker compose up
-d --build --wait`), `./raadi smoke`, and `./raadi e2e` twice. Push, open the PR (labels `enhancement`,
   `security`), wait for CI, merge.
6. **Release tags** (signed, see `docs/releasing.md`; the `v*` tag ruleset requires signatures):
   - `v0.1.0` on `a3d3165` (Phase 1)
   - `v0.2.0` on `131b610` (Phase 2)
   - `v0.3.0-alpha.1` on `b3216de` (Phase 3 up to sign-up, as in `CHANGELOG.md`)
   - `v0.3.0-alpha.2` after payments merges, with a new `CHANGELOG.md` entry

   Each tag gets a GitHub Release with generated notes (pre-release for `alpha`).

7. **Next slice: Expo app** (Expo Router, shared `@raadi/api-client`, Expo dev server in a container). Expo
   push becomes a channel of the notifications queue.

## Gotchas found this session

- **Switching branches with a running stack:** the Keycloak database keeps the other branch's realm settings
  (e.g. the `passwordBlacklist` policy whose file only exists on newer branches), and Keycloak crash-loops.
  Do a cold start after switching between branches that change Keycloak or init.
- **Docker Desktop wedges after the laptop sleeps:** Kafka stops answering and containers cannot be killed.
  Run `systemctl --user restart docker-desktop`, then do a cold start. The network can also drop during
  builds (`ENOTFOUND registry.npmjs.org`); retry.
- **1Password locks the SSH agent** ("communication with agent failed" or "failed to fill whole buffer"),
  which blocks signed commits and pushes. Ask the user to unlock it; never disable signing.
- **Worktrees** (`../raadi-signup` is merged and can be removed; `../raadi-fix` is PR #7): run
  `./raadi lint` on the worktree's files before pushing. CI caught a Prettier issue once. The toolbox only
  mounts `/home/jibs/raadi`; bind-mount worktree files explicitly.
- **A service that starts consuming Kafka** needs `kafka-init: service_completed_successfully` in
  `depends_on`. Otherwise you get "Group authorization failed" on a cold start.
- **The smoke test runs right after a cold start,** so demo users' first login goes to `/<locale>/welcome`.
  The checks accept both outcomes.
- **CI logs:** a failed full-stack job uploads `compose-logs.txt` as an artifact (download it through the
  API). That is how the OpenBao bug was found.
- **Event schemas are JSON Schema draft-07** (Apicurio cannot check 2020-12). Adding an optional field is
  BACKWARD compatible. Removing one is not, so a dev registry then needs `down -v`.
- **Events never carry names** (enforced by listings' tests). Services get public names from listings'
  internal contact API with the user's token.
