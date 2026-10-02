-- migrate:up
-- Paid promotions (ADR-0020): payments publishes promotion.changed, listings
-- records the end time so search and the API show it.
ALTER TABLE listings ADD COLUMN promoted_until timestamptz;

-- Inbox for exactly-once handling of at-least-once events.
CREATE TABLE processed_events (
    event_id      uuid PRIMARY KEY,
    processed_at  timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE processed_events;
ALTER TABLE listings DROP COLUMN promoted_until;
