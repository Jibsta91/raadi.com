-- migrate:up
-- Uploaded images. Only scanned, re-encoded (metadata-stripped) images are
-- stored; rejected uploads keep a row for abuse analytics but no bytes.
CREATE TABLE media (
    id                uuid PRIMARY KEY,
    owner_id          uuid        NOT NULL,            -- Keycloak subject
    status            text        NOT NULL CHECK (status IN ('ready', 'rejected', 'deleted')),
    content_type      text        NOT NULL,
    bytes             integer     NOT NULL CHECK (bytes >= 0),
    width             integer,
    height            integer,
    sha256            text        NOT NULL,
    rejection_reason  text,
    listing_id        uuid,                            -- set from listing events
    created_at        timestamptz NOT NULL DEFAULT now(),
    attached_at       timestamptz,
    deleted_at        timestamptz
);
CREATE INDEX media_owner_idx ON media (owner_id, created_at DESC);
CREATE INDEX media_listing_idx ON media (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX media_orphans_idx ON media (created_at) WHERE listing_id IS NULL AND status = 'ready';

-- Inbox: ids of consumed events, written in the same transaction as their
-- effect, so redelivered events are ignored (exactly-once processing).
CREATE TABLE processed_events (
    event_id      uuid PRIMARY KEY,
    processed_at  timestamptz NOT NULL DEFAULT now()
);

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
DROP TABLE processed_events;
DROP TABLE media;
