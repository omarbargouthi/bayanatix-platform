-- 167: what to do with a built-in field when the source has no value for it.
-- db/166 lets a crawl fill table type, column type, friendly name and the Encrypted flag
-- from the source. This setting decides what happens when the mapped property / comment
-- key is missing or empty at the source:
--   KEEP          leave the value in Bayanis as it is (default)
--   CLEAR_SYNCED  clear it only if that value had itself come from the source
--   CLEAR_ALWAYS  the source is authoritative: clear it whatever its origin
-- A cleared value is a change like any other and goes to the table's metadata-update review.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.source_field_sync_settings (
  settings_id             smallint PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  empty_source_value_mode varchar(20) NOT NULL DEFAULT 'KEEP'
    CHECK (empty_source_value_mode IN ('KEEP', 'CLEAR_SYNCED', 'CLEAR_ALWAYS')),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id      varchar(100)
);
INSERT INTO bayanat.source_field_sync_settings (settings_id) VALUES (1) ON CONFLICT DO NOTHING;

COMMIT;
