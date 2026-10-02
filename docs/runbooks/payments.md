# Payments

The payments service ([ADR-0020](../adr/0020-payments.md)) sells promoted listings through a provider
(Vipps MobilePay, or Stripe; `payments-mock` in development). Dashboard: **Raadi · Marketplace**, panels
"Payments by status" and "Payment webhooks". Alerts: `PaymentsStuckOpen`, `PaymentWebhooksRejected`.

## Orders stay "created" or "authorized" (`PaymentsStuckOpen`)

Reconciliation re-checks open orders every 30 s, so stuck orders mean the provider cannot be reached or
refuses Raadi's credentials.

1. Logs: `docker compose logs payments --since 30m | grep -iE 'reconcile|capture|provider'`. The circuit
   breakers are `vipps`/`stripe` and `listings`.
2. Credentials: a `401` from `/accesstoken/get` means the client secret or subscription key in OpenBao
   (`raadi/payments`) does not match the provider's portal.
3. "authorized" but never "captured": the capture is retried with the same idempotency key, so retrying is
   safe. If the provider shows the money as captured, the next reconciliation records it.

## Webhooks are refused (`PaymentWebhooksRejected`)

Signatures are checked over the raw body, the host and the date.

- **Vipps:** the webhook secret in OpenBao (`vipps_webhook_secret`) must be the one the Webhooks API returned
  when the webhook was registered. Clocks must be within 5 minutes (check NTP).
- **Stripe:** `stripe_webhook_secret` (`whsec_…`) must belong to the endpoint configured in Stripe.
- A reverse proxy must not rewrite the body or the `Host` header.

Orders still complete through reconciliation while webhooks fail; only the confirmation is slower.

## Refund an order

Platform admins only: `POST /api/v1/payments/orders/<id>/refund`. Refunds are in full. The listing's
promotion ends (or falls back to another running one), and listings and search follow through events.

## Test payments in development

Promote a listing from its page. The payer lands on `http://pay.raadi.localhost/pay/<order>` (Raadi Pay,
test), with **Approve**, **Decline** and **Approve, but lose the webhook** (the last one exercises
reconciliation). No money moves.
