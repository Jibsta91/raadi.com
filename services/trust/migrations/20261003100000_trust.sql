-- migrate:up
-- Reviews and identity verification (ADR-0018). Users are Keycloak subjects.

-- What this service knows about listings, from listing events: enough to
-- decide whether a deal happened (owner, sold) and to label a review.
CREATE TABLE listings (
    id          uuid PRIMARY KEY,
    owner_id    uuid        NOT NULL,
    title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    status      text        NOT NULL CHECK (status IN ('active', 'sold', 'deleted')),
    -- When the listing last became sold; cleared when it is relisted, kept when it is deleted.
    sold_at     timestamptz,
    version     integer     NOT NULL
);

-- Who wrote to whom about which listing, from message events. Both directions
-- must exist before either party may review the other.
CREATE TABLE contacts (
    listing_id    uuid        NOT NULL,
    sender_id     uuid        NOT NULL,
    recipient_id  uuid        NOT NULL,
    first_at      timestamptz NOT NULL,
    PRIMARY KEY (listing_id, sender_id, recipient_id)
);

-- Public display names ("Kari N."), from listing events and from users' own tokens.
CREATE TABLE people (
    user_id       uuid PRIMARY KEY,
    display_name  text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
    id             uuid PRIMARY KEY,
    listing_id     uuid        NOT NULL,
    listing_title  text        NOT NULL CHECK (char_length(listing_title) BETWEEN 1 AND 120),
    reviewer_id    uuid        NOT NULL,
    reviewer_name  text        NOT NULL CHECK (char_length(reviewer_name) BETWEEN 1 AND 80),
    subject_id     uuid        NOT NULL,
    subject_role   text        NOT NULL CHECK (subject_role IN ('buyer', 'seller')),
    rating         smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        text        NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
    created_at     timestamptz NOT NULL DEFAULT now(),
    removed_at     timestamptz,
    removed_by     text        CHECK (removed_by IN ('author', 'moderator')),
    CHECK (reviewer_id <> subject_id),
    CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
    -- One review per deal and direction. A deleted review stays as a tombstone,
    -- so it cannot be replaced (no rating by trial and error).
    UNIQUE (listing_id, reviewer_id, subject_id)
);
CREATE INDEX reviews_subject_idx ON reviews (subject_id, created_at DESC) WHERE removed_at IS NULL;

-- Identity verification. Only a keyed hash of the provider's subject is kept,
-- to stop one person verifying several accounts; never a national identity number.
CREATE TABLE verifications (
    user_id        uuid PRIMARY KEY,
    method         text        NOT NULL CHECK (method IN ('bankid')),
    identity_hash  bytea       NOT NULL UNIQUE,
    verified_at    timestamptz NOT NULL DEFAULT now()
);

-- Pending verification redirects (state, nonce, PKCE), bound to the user who started them.
CREATE TABLE verification_requests (
    state          text PRIMARY KEY,
    user_id        uuid        NOT NULL,
    nonce          text        NOT NULL,
    code_verifier  text        NOT NULL,
    return_to      text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_requests_created_idx ON verification_requests (created_at);

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
DROP TABLE verification_requests;
DROP TABLE verifications;
DROP TABLE reviews;
DROP TABLE people;
DROP TABLE contacts;
DROP TABLE listings;
