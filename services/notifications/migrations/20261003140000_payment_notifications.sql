-- migrate:up
-- Receipts and promotion notices for payments (ADR-0020).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed', 'review_received', 'listing_promoted'));
ALTER TABLE emails DROP CONSTRAINT emails_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_kind_check
    CHECK (kind IN ('new_message', 'listing_removed', 'payment_receipt'));

-- migrate:down
DELETE FROM notifications WHERE kind = 'listing_promoted';
DELETE FROM emails WHERE kind = 'payment_receipt';
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed', 'review_received'));
ALTER TABLE emails DROP CONSTRAINT emails_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_kind_check CHECK (kind IN ('new_message', 'listing_removed'));
