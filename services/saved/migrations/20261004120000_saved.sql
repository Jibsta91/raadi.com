-- migrate:up
-- Favourites and saved searches (ADR-0026). Users are Keycloak subjects.

-- A listing someone favourited, kept current from listing events: enough to
-- show a favourites list (also after the listing is sold) and to spot price
-- drops. Only listings with at least one favourite are kept.
CREATE TABLE listings (
    id            uuid PRIMARY KEY,
    version       integer     NOT NULL,
    owner_id      uuid,
    status        text        NOT NULL CHECK (status IN ('active', 'sold', 'deleted')),
    category      text        NOT NULL,
    subcategory   text        NOT NULL,
    title         text        NOT NULL,
    price_nok     bigint,
    image_id      uuid,
    place_name    text        NOT NULL,
    county        text        NOT NULL,
    published_at  timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE favourites (
    user_id     uuid        NOT NULL,
    listing_id  uuid        NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX favourites_listing_idx ON favourites (listing_id);
CREATE INDEX favourites_user_idx ON favourites (user_id, created_at DESC);

-- A search to repeat. `params` is the search API's query (strings), without
-- paging or sorting. The matcher looks for listings published in
-- (checked_until, now - lag] and moves checked_until forward.
CREATE TABLE saved_searches (
    id             uuid PRIMARY KEY,
    user_id        uuid        NOT NULL,
    name           text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    params         jsonb       NOT NULL,
    notify         boolean     NOT NULL DEFAULT true,
    new_count      integer     NOT NULL DEFAULT 0,
    checked_until  timestamptz NOT NULL DEFAULT now(),
    next_run_at    timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, params)
);
CREATE INDEX saved_searches_user_idx ON saved_searches (user_id, created_at DESC);
CREATE INDEX saved_searches_due_idx ON saved_searches (next_run_at) WHERE notify;

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

-- Inbox for exactly-once handling of at-least-once events.
CREATE TABLE processed_events (
    event_id      uuid PRIMARY KEY,
    processed_at  timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE processed_events;
DROP TABLE outbox;
DROP TABLE saved_searches;
DROP TABLE favourites;
DROP TABLE listings;
