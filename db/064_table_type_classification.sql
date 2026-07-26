-- Table type classification: the crawler suggests one of the five table
-- types (Master / Transaction / Lookup-Reference / Setup / System) based on
-- naming, column layout, and row-count signals. entity_category_code stays
-- the single "current effective type" field the rest of the app already
-- reads; these new columns track whether that value is a live suggestion
-- (steward hasn't looked at it yet) or has been explicitly confirmed.

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS suggested_category_code  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS category_confidence_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS category_is_confirmed    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_confirmed_by    VARCHAR(64) REFERENCES bayanat.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_confirmed_at    TIMESTAMP;

ALTER TABLE bayanat.data_entities
  ADD CONSTRAINT data_entities_category_confidence_check
  CHECK (category_confidence_code IS NULL OR category_confidence_code IN ('HIGH','MEDIUM','LOW'));

-- Any table type set before this feature existed was set by a human —
-- treat it as already confirmed rather than something the model suggested.
UPDATE bayanat.data_entities
SET category_is_confirmed = true
WHERE entity_category_code IS NOT NULL AND NOT category_is_confirmed;
