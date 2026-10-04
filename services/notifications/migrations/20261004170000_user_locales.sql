-- migrate:up
-- The language each user chose on the website or in the app (identity events). E-mails and
-- pushes use it; Keycloak's locale attribute is the fallback.
CREATE TABLE user_locales (
    user_id     uuid PRIMARY KEY,
    locale      text        NOT NULL CHECK (locale IN ('nb', 'en', 'so')),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE user_locales;
