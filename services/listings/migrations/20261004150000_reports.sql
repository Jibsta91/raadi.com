-- migrate:up
-- Reports from users about listings, worked by moderators (ADR-0027). Reporters
-- are Keycloak subjects; a comment is free text the moderators read.
CREATE TABLE reports (
    id           uuid PRIMARY KEY,
    listing_id   uuid        NOT NULL REFERENCES listings (id),
    reporter_id  uuid        NOT NULL,
    reason       text        NOT NULL
                             CHECK (reason IN ('fraud', 'prohibited', 'offensive', 'wrong_category', 'other')),
    comment      text        NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
    status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    handled_by   uuid,
    handled_at   timestamptz
);
-- One open report per person and listing: reporting again updates it.
CREATE UNIQUE INDEX reports_open_once_idx ON reports (listing_id, reporter_id) WHERE status = 'open';
CREATE INDEX reports_queue_idx ON reports (listing_id) WHERE status = 'open';
CREATE INDEX reports_reporter_idx ON reports (reporter_id, created_at DESC);

-- migrate:down
DROP TABLE reports;
