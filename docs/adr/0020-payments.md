# 0020 — Payments: provider adapters, idempotent orders, signed webhooks, reconciliation

- Status: Accepted
- Date: 2026-10-02

## Decision

- The **payments** service sells **promoted listings** (7 or 30 days; prices in øre, VAT included). Promoted
  listings rank first under "relevance" in search and carry a "Promoted" badge. A new purchase stacks after
  a running promotion.
- **Providers are adapters behind one interface** (create, status, capture, refund, cancel, verify webhook).
  `PAYMENTS_PROVIDER` selects one:
  - **Vipps MobilePay ePayment API** (default, `WEB_REDIRECT` flow): access-token caching, `Idempotency-Key`
    on every write, capture after authorization.
  - **Stripe Checkout** (hosted page, automatic capture), with a pinned `Stripe-Version`.

  Payers approve on the provider's hosted page; **Raadi never sees card or account data** (minimal PCI
  scope).

- **`payments-mock`** ("Raadi Pay (test)") is a development stand-in that implements the Vipps ePayment API
  subset Raadi uses, with the same shapes, states and **webhook signatures**. The real Vipps adapter
  therefore runs end to end in development, smoke and e2e tests. It also misbehaves on purpose:
  - every webhook is delivered twice;
  - "approve, but lose the webhook" exercises reconciliation;
  - unanswered payments expire.

  It runs only in development; production points `VIPPS_BASE_URL` at Vipps. The Stripe adapter is checked
  with contract tests on recorded API shapes and signatures.

- **Orders are idempotent.** `POST /orders` requires an `Idempotency-Key`. A retry returns the same order (200);
  the same key with a different request is 409. Provider calls use stable keys derived from the order
  (`create-`, `capture-` or `refund-` plus the order id), so retries never charge twice.
- **An explicit state machine** (created → authorized → captured → refunded; cancelled, expired, failed) is
  a pure function. Duplicate, late and out-of-order events are ignored and never move an order backwards.
  Every change is recorded in `order_events` with its source (api, webhook, reconcile, admin), under a row
  lock.
- **Webhooks are authenticated by the provider's HMAC signature** over the raw body: Vipps' `x-ms-date` /
  `x-ms-content-sha256` / `Authorization` scheme, or Stripe's `Stripe-Signature`. Events outside a 5-minute
  window are refused. They are processed exactly once through `webhook_inbox`. The webhook route has no
  forward-auth (providers carry no user token), but the same rate limits.
- **Reconciliation** re-checks open orders with the provider every 30 s: after a lost webhook, a failed
  capture, or when the payer returns before the webhook arrives. Webhooks are an optimisation; the
  provider's status is the source of truth.
- **Events.** When an order is captured, `payment.captured` and `promotion.changed` (keyed by listing) are
  written to the outbox in the same transaction:
  - Listings consumes `promotion.changed` and records `promotedUntil` (a version bump, so search
    re-indexes; `updated_at` is unchanged).
  - Notifications sends a **receipt** with price, VAT (25 %), date and seller (always sent: a legal
    document), plus an in-app notice.
- **Refunds** are for platform admins only. They refund in full through the provider and revoke the order's
  promotion.

## Alternatives considered

- **Embedding card forms (Stripe Elements)**: more PCI scope, and another provider's UI to localise.
- **Polling only, no webhooks**: slower, and still needs reconciliation. Webhooks plus reconciliation is the
  provider-recommended combination.
- **A generic mock with its own API**: the Vipps adapter would never run before production. Mimicking the
  real API costs the same and tests the real code path.
- **Promotion state in search only**: search writes whole documents under external versioning, so
  promotions would be lost on the next listing update. The listing owns `promotedUntil`; payments owns the
  purchase.

## Consequences

Production needs a Vipps MobilePay merchant agreement (client id and secret, subscription key, merchant
serial number) and a webhook registered through Vipps' Webhooks API, whose secret goes into OpenBao
(`raadi/payments`). A Stripe account is the alternative. Receipts need the operator's legal name and
organisation number (`RECEIPT_MERCHANT`). Partial refunds, invoices and payouts to sellers are out of scope.
