-- migrate:up
-- Minimal local profile for users authenticated by Keycloak. Keycloak stays the
-- source of truth for credentials; we store only what the platform needs
-- (data minimisation, GDPR Art. 5(1)(c)).
CREATE TABLE user_profiles (
    id             uuid PRIMARY KEY,                 -- Keycloak subject (sub)
    email          text        NOT NULL,
    display_name   text,
    locale         text        NOT NULL DEFAULT 'nb' CHECK (locale IN ('nb', 'en', 'so')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    last_login_at  timestamptz
);

-- Transactional outbox: rows are written in the same transaction as the state
-- change and published to Kafka by Debezium (ADR-0008). Payloads carry IDs,
-- not personal data.
CREATE TABLE outbox (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  text        NOT NULL,
    aggregate_id    text        NOT NULL,
    event_type      text        NOT NULL,
    payload         jsonb       NOT NULL,
    headers         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_created_at_idx ON outbox (created_at);

-- migrate:down
DROP TABLE outbox;
DROP TABLE user_profiles;
