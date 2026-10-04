-- migrate:up
-- Alerts from favourites and saved searches (ADR-0026).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed', 'review_received', 'listing_promoted',
                    'favourite_price_drop', 'favourite_sold', 'saved_search_match'));
ALTER TABLE emails DROP CONSTRAINT emails_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_kind_check
    CHECK (kind IN ('new_message', 'listing_removed', 'payment_receipt', 'saved_search_match'));
ALTER TABLE pushes DROP CONSTRAINT pushes_kind_check;
ALTER TABLE pushes ADD CONSTRAINT pushes_kind_check
    CHECK (kind IN ('new_message', 'listing_removed', 'review_received', 'listing_promoted',
                    'favourite_price_drop', 'favourite_sold', 'saved_search_match'));

-- migrate:down
DELETE FROM notifications WHERE kind IN ('favourite_price_drop', 'favourite_sold', 'saved_search_match');
DELETE FROM emails WHERE kind = 'saved_search_match';
DELETE FROM pushes WHERE kind IN ('favourite_price_drop', 'favourite_sold', 'saved_search_match');
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('listing_removed', 'review_received', 'listing_promoted'));
ALTER TABLE emails DROP CONSTRAINT emails_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_kind_check
    CHECK (kind IN ('new_message', 'listing_removed', 'payment_receipt'));
ALTER TABLE pushes DROP CONSTRAINT pushes_kind_check;
ALTER TABLE pushes ADD CONSTRAINT pushes_kind_check
    CHECK (kind IN ('new_message', 'listing_removed', 'review_received', 'listing_promoted'));
