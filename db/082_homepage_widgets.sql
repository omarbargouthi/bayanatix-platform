-- 082: personalized Homepage widget layout. One row per user holding their
-- ordered, enabled widget keys — no row yet means "use the code-defined
-- DEFAULT_WIDGET_KEYS", so no backfill is needed for existing users.
CREATE TABLE IF NOT EXISTS bayanat.user_homepage_layout (
  user_id     VARCHAR(255) PRIMARY KEY REFERENCES bayanat.users(user_id),
  widget_keys TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
