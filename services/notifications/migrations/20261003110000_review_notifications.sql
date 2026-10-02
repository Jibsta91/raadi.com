-- migrate:up
-- In-app notice when someone reviews you (ADR-0018).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed', 'review_received'));

-- migrate:down
DELETE FROM notifications WHERE kind = 'review_received';
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed'));
