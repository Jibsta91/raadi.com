# 0016 — Messaging: REST to send, WebSocket to push, participants on the row

- Status: Accepted
- Date: 2026-10-01

## Decision

- A **conversation** is one buyer's thread with the seller about one listing (unique per listing and buyer).
  The **messaging** service owns conversations and messages in its own database
  ([ADR-0008](0008-database-per-service-and-outbox.md)).
- **Sending is plain REST** (`POST /api/v1/messaging/conversations[/{id}/messages]`). That keeps the gateway's
  CSRF check, body limits, zod validation and rate limits in one code path, and it is what the mobile app will
  use too.
- **Live delivery is a push-only WebSocket** (`/api/v1/messaging/ws`) for new messages and read receipts:
  - The handshake goes through the gateway's forward-auth, so browsers authenticate with the session cookie
    and never see a token. Messaging verifies the JWT itself and refuses foreign `Origin` headers, which
    blocks cross-site WebSocket hijacking.
  - A socket lives no longer than its access token: the server closes it with code 4001 at expiry, and the
    client reconnects with backoff, which gets it a fresh token.
  - Heartbeats detect dead peers, frames from clients are ignored (`maxPayload` 1 KB), and each user may
    hold at most 5 sockets.
- **Instances share events through Valkey pub/sub** (`messaging:events`). Messaging has its own Valkey **ACL
  user** that may only `PUBLISH`/`SUBSCRIBE` on `messaging:*`. It cannot read any key, so identity-bff's
  sessions stay unreachable.
- **Who may read a conversation is decided by the conversation row** (buyer and seller ids). Every query
  filters on the caller, so another user gets `404`, not `403`. OpenFGA ([ADR-0013](0013-authorization.md)) is
  not used here: participation is fixed when the conversation is created, never shared or delegated, so
  storing it twice would only add a dual write.
- When a conversation starts, messaging asks listings who the seller is through an **internal endpoint**
  (`/internal/v1/listings/{id}/contact`). The gateway doesn't route it, and messaging forwards the user's
  token. The title, first image and display names are copied onto the conversation, so the inbox renders
  without further calls. Owner ids are never in public listing responses.
- Every message writes a `message_sent` event to the outbox ([ADR-0012](0012-event-backbone.md)) with **ids
  only**. Message text stays in the messaging database. Notifications (e-mail, push) will consume these events.

## Alternatives considered

- **Sending over the WebSocket**: one connection for everything, but it would need its own CSRF, validation
  and rate-limit path, and acknowledgements and retries on top. REST already provides them.
- **Server-Sent Events**: simpler and one-way, which is all we push. The specification asked for WebSockets,
  and they leave room for typing indicators later.
- **A Socket.IO-style library**: adds its own protocol and fallbacks that every current browser no longer
  needs. `ws` (MIT) on the Fastify server is small and standard.
- **Consuming listing events for seller details**: listing events carry no seller name (personal data), and a
  local copy of every listing for a rare lookup is more machinery than one internal call.

## Consequences

Live delivery is best effort: a message is stored before it is pushed, and a client that missed a push catches
up when it reloads. If Valkey is down, messaging reports not ready, since live delivery and fan-out depend on
it. Spam and scam detection on message text arrive with the AI Cybersecurity pillar (Phase 4). Until then,
rate limits and length limits apply. Message bodies are personal data, so GDPR export and erasure (Phase 4)
must include the messaging database.
