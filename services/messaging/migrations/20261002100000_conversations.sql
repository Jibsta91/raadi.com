-- migrate:up
-- Buyer-seller conversations about a listing (ADR-0016). Participants are the
-- two Keycloak subjects on the row; they are the only ones who may read it.
-- Listing title, image and display names are copied when the conversation
-- starts, so the inbox renders without calling other services.
CREATE TABLE conversations (
    id                uuid PRIMARY KEY,
    listing_id        uuid        NOT NULL,
    listing_title     text        NOT NULL CHECK (char_length(listing_title) BETWEEN 1 AND 120),
    listing_image_id  uuid,
    seller_id         uuid        NOT NULL,
    seller_name       text        NOT NULL CHECK (char_length(seller_name) BETWEEN 1 AND 80),
    buyer_id          uuid        NOT NULL,
    buyer_name        text        NOT NULL CHECK (char_length(buyer_name) BETWEEN 1 AND 80),
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_message_at   timestamptz NOT NULL DEFAULT now(),
    buyer_read_at     timestamptz NOT NULL DEFAULT now(),
    seller_read_at    timestamptz NOT NULL DEFAULT '-infinity',
    CHECK (buyer_id <> seller_id),
    UNIQUE (listing_id, buyer_id)
);
CREATE INDEX conversations_buyer_idx ON conversations (buyer_id, last_message_at DESC);
CREATE INDEX conversations_seller_idx ON conversations (seller_id, last_message_at DESC);

CREATE TABLE messages (
    id               uuid PRIMARY KEY,
    conversation_id  uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    sender_id        uuid        NOT NULL,
    body             text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC, id DESC);

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
DROP TABLE messages;
DROP TABLE conversations;
