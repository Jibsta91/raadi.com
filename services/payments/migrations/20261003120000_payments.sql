-- migrate:up
-- Payments for promoted listings (ADR-0020). Amounts are integer øre. No card
-- or account data is ever stored: payers approve at the provider's hosted page.

CREATE TABLE orders (
    id               uuid PRIMARY KEY,
    user_id          uuid        NOT NULL,
    listing_id       uuid        NOT NULL,
    product          text        NOT NULL CHECK (product IN ('promote_7d', 'promote_30d')),
    amount_ore       integer     NOT NULL CHECK (amount_ore > 0),
    currency         text        NOT NULL DEFAULT 'NOK' CHECK (currency = 'NOK'),
    provider         text        NOT NULL CHECK (provider IN ('vipps', 'stripe')),
    provider_ref     text,
    redirect_url     text,
    status           text        NOT NULL DEFAULT 'created'
                                 CHECK (status IN ('created', 'authorized', 'captured', 'refunded',
                                                   'cancelled', 'expired', 'failed')),
    -- The client's Idempotency-Key: a retried request returns the same order.
    idempotency_key  text        NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
    request_hash     text        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_open_idx ON orders (updated_at) WHERE status IN ('created', 'authorized');

-- Every state change, with where it came from (api, webhook, reconcile).
CREATE TABLE order_events (
    id          bigserial PRIMARY KEY,
    order_id    uuid        NOT NULL REFERENCES orders (id),
    from_status text        NOT NULL,
    to_status   text        NOT NULL,
    source      text        NOT NULL CHECK (source IN ('api', 'webhook', 'reconcile', 'admin')),
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

-- Webhooks are processed exactly once (providers retry and may send duplicates).
CREATE TABLE webhook_inbox (
    provider     text        NOT NULL,
    event_id     text        NOT NULL,
    received_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, event_id)
);

-- What a captured order bought. Stacked purchases extend each other.
CREATE TABLE promotions (
    order_id    uuid PRIMARY KEY REFERENCES orders (id),
    listing_id  uuid        NOT NULL,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz NOT NULL CHECK (ends_at > starts_at),
    revoked_at  timestamptz
);
CREATE INDEX promotions_listing_idx ON promotions (listing_id, ends_at DESC) WHERE revoked_at IS NULL;

-- Transactional outbox (ADR-0008), streamed to Kafka by Debezium.
CREATE TABLE outbox (
    id              uuid PRIMARY KEY,
    aggregate_type  text        NOT NULL,
    aggregate_id    text        NOT NULL,
    event_type      text        NOT NULL,
    payload         jsonb       NOT NULL,
    traceparent     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_created_at_idx ON outbox (created_at);

-- migrate:down
DROP TABLE outbox;
DROP TABLE promotions;
DROP TABLE webhook_inbox;
DROP TABLE order_events;
DROP TABLE orders;
