-- migrate:up
-- In-app notifications and the e-mail queue (ADR-0017). Recipients are
-- Keycloak subjects; e-mail addresses are looked up when sending and never
-- stored here (data minimisation).
CREATE TABLE notifications (
    id          uuid PRIMARY KEY,
    user_id     uuid        NOT NULL,
    kind        text        NOT NULL CHECK (kind IN ('listing_removed')),
    ref_id      uuid        NOT NULL,
    params      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    read_at     timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- E-mails are queued by the event consumer and sent by a separate worker, so a
-- slow or failing mail server never holds up event processing.
CREATE TABLE emails (
    id               uuid PRIMARY KEY,
    user_id          uuid        NOT NULL,
    kind             text        NOT NULL CHECK (kind IN ('new_message', 'listing_removed')),
    ref_id           uuid        NOT NULL,
    params           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status           text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
    attempts         integer     NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    sent_at          timestamptz
);
CREATE INDEX emails_due_idx ON emails (next_attempt_at) WHERE status = 'pending';
CREATE INDEX emails_throttle_idx ON emails (user_id, kind, ref_id, created_at DESC);

CREATE TABLE preferences (
    user_id         uuid PRIMARY KEY,
    email_messages  boolean     NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Inbox for exactly-once handling of at-least-once events.
CREATE TABLE processed_events (
    event_id      uuid PRIMARY KEY,
    processed_at  timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE processed_events;
DROP TABLE preferences;
DROP TABLE emails;
DROP TABLE notifications;
