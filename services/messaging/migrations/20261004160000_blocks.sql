-- migrate:up
-- Blocking (ADR-0027): a blocked person can no longer message the blocker, in any
-- conversation, and the blocker's conversations with them are closed both ways.
CREATE TABLE blocks (
    blocker_id  uuid        NOT NULL,
    blocked_id  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

-- migrate:down
DROP TABLE blocks;
