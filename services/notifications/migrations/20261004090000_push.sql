-- migrate:up
-- Push notifications to the mobile app through the Expo push service (ADR-0025).
-- A device is an app installation that a signed-in user registered; the token
-- moves to whoever signs in on that device next, and is deleted on sign-out or
-- when the push service reports the app as uninstalled.
CREATE TABLE devices (
    token         text PRIMARY KEY CHECK (length(token) <= 255),
    user_id       uuid        NOT NULL,
    platform      text        NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_user_idx ON devices (user_id);

-- Pushes are queued by the event consumer and sent by a separate worker, like
-- e-mails. One row per user and notification; the worker sends it to every
-- device the user has at that moment. No message text is stored or sent.
CREATE TABLE pushes (
    id               uuid PRIMARY KEY,
    user_id          uuid        NOT NULL,
    kind             text        NOT NULL
                                 CHECK (kind IN ('new_message', 'listing_removed', 'review_received', 'listing_promoted')),
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
CREATE INDEX pushes_due_idx ON pushes (next_attempt_at) WHERE status = 'pending';
CREATE INDEX pushes_throttle_idx ON pushes (user_id, kind, ref_id, created_at DESC);

ALTER TABLE preferences ADD COLUMN push_messages boolean NOT NULL DEFAULT true;

-- migrate:down
ALTER TABLE preferences DROP COLUMN push_messages;
DROP TABLE pushes;
DROP TABLE devices;
