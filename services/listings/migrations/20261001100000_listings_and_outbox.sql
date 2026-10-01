-- migrate:up
-- Marketplace listings. Location is a PostGIS geography point taken from the
-- offline gazetteer (@raadi/catalog); the seller name is the public display
-- name the seller chose to publish (data minimisation: no e-mail, no phone).
CREATE TABLE listings (
    id            uuid PRIMARY KEY,
    owner_id      uuid        NOT NULL,                -- Keycloak subject
    seller_name   text        NOT NULL CHECK (char_length(seller_name) BETWEEN 1 AND 80),
    category      text        NOT NULL,
    subcategory   text        NOT NULL,
    title         text        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    description   text        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 5000),
    price_nok     bigint      CHECK (price_nok >= 0),
    attributes    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    place_id      text        NOT NULL,
    location      geography(Point, 4326) NOT NULL,
    image_ids     uuid[]      NOT NULL DEFAULT '{}' CHECK (cardinality(image_ids) <= 10),
    status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'deleted')),
    version       integer     NOT NULL DEFAULT 1,      -- optimistic concurrency + event ordering
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    published_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_owner_idx ON listings (owner_id, created_at DESC) WHERE status <> 'deleted';
CREATE INDEX listings_recent_idx ON listings (published_at DESC) WHERE status = 'active';
CREATE INDEX listings_location_idx ON listings USING gist (location);

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
DROP TABLE listings;
