-- 156: term assignment weights as configuration.
-- Everything that turns pattern matches into a suggested term's confidence is now a
-- setting instead of a constant in the scoring code:
--   * a factor per kind of evidence (column name, sampled value, checksum), applied on
--     top of each pattern's own weight — rebalances all patterns of a kind at once;
--   * the confidence bands (HIGH / MEDIUM), which also drive auto-accept.
-- Defaults reproduce the previous behaviour exactly. Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.sit_settings
  ADD COLUMN IF NOT EXISTS name_weight_factor     numeric(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS value_weight_factor    numeric(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS checksum_weight_factor numeric(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS high_band_threshold    numeric(4,3) NOT NULL DEFAULT 0.850,
  ADD COLUMN IF NOT EXISTS medium_band_threshold  numeric(4,3) NOT NULL DEFAULT 0.500;

ALTER TABLE bayanat.sit_settings DROP CONSTRAINT IF EXISTS sit_settings_weights_check;
ALTER TABLE bayanat.sit_settings ADD CONSTRAINT sit_settings_weights_check CHECK (
  name_weight_factor BETWEEN 0 AND 5 AND value_weight_factor BETWEEN 0 AND 5 AND checksum_weight_factor BETWEEN 0 AND 5
  AND high_band_threshold BETWEEN 0 AND 1 AND medium_band_threshold BETWEEN 0 AND 1
  AND medium_band_threshold <= high_band_threshold
);

COMMIT;
