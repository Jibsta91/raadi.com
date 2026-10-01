# 0017 — Notifications: events in, queued e-mail out, addresses looked up at send time

- Status: Accepted
- Date: 2026-10-01

## Decision

- The **notifications** service consumes domain events (consumer group `notifications`:
  `raadi.conversation.events`, `raadi.listing.events`) and turns them into **in-app notifications** and
  **e-mails**. Other services never send e-mail themselves.
- Current triggers:
  - `message_sent` → an e-mail to the recipient (no in-app entry, because messages have their own inbox and
    badge). At most one per conversation and recipient every 30 minutes (`EMAIL_THROTTLE_MINUTES`). Users can
    switch these e-mails off.
  - `listing.deleted` with `reason: "moderation"` → an in-app notification and an e-mail to the owner. Service
    notices are always sent. The event gained optional `ownerId`, `title` and `reason` fields, a
    BACKWARD-compatible change ([ADR-0012](0012-event-backbone.md)). Owners deleting their own listing get
    nothing.
- **The consumer never talks to the mail server.** In one transaction with an inbox row (exactly-once per
  event) it writes notifications and **queued e-mails**. A sender loop claims due e-mails
  (`FOR UPDATE SKIP LOCKED` plus a lease, so any number of instances can send), sends them, and retries
  failures with exponential backoff (30 s → 1 h) up to `EMAIL_MAX_ATTEMPTS`. A slow or failing mail server
  therefore never stalls event processing or other consumers.
- **Addresses are looked up at send time and never stored.** Keycloak is the system of record for e-mail
  address and language. The `notifications` client's service account has only `realm-management/view-users`.
  Users who were deleted or disabled, or whose address is unverified, are skipped.
- **E-mails carry no message text, no contact details and no tracking**, only a short localized notice
  (nb/en/so, from the Keycloak locale) with a link back into the signed-in app and to the settings. That is
  data minimisation and makes phishing look-alikes easier to spot.
- SMTP comes from configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`). The password, if any,
  comes from OpenBao. In development every mail goes to Mailpit.
- Readiness covers PostgreSQL and Kafka only. Keycloak and SMTP are soft dependencies: their outages show up
  as a growing `raadi_notifications_email_queue` (alert `EmailQueueBacklog`), not as an unavailable API.

## Alternatives considered

- **Sending from the producing services**: every service would need SMTP credentials and templates, plus the
  same retry logic.
- **Sending inside the Kafka handler with in-place retries**: an SMTP outage would block the partition and
  lag every notification behind it.
- **Copying e-mail addresses into notification events or this database**: spreads personal data and goes
  stale when users change their address.
- **A hosted e-mail API (SES, Postmark…)**: not offline-capable and not OSI. Any provider that speaks SMTP
  works through the configuration above.

## Consequences

Expo push (mobile) arrives with the mobile app as another channel of the same queue. The language comes from
Keycloak's locale attribute; the in-app language preference (identity-bff) is not synced there yet. E-mail
logs (`emails` table, no addresses) are kept for auditing; retention is part of the Phase 4 GDPR work.
