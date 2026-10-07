-- 155: configurable weight for a name-only SIT match.
-- When a table has no live connection its values can't be sampled, so a column is
-- scored on its name alone. The catalog's name patterns weigh 0.40 (they are meant to
-- add to a value match), which can never reach the HIGH band (0.85). This setting is
-- the weight a name match carries in that name-only case; 0.85 lets it reach HIGH.
-- With sampled values the patterns keep their own weights. Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.sit_settings
  ADD COLUMN IF NOT EXISTS name_only_match_weight numeric(4,3) NOT NULL DEFAULT 0.850;

ALTER TABLE bayanat.sit_settings DROP CONSTRAINT IF EXISTS sit_settings_name_only_weight_check;
ALTER TABLE bayanat.sit_settings ADD CONSTRAINT sit_settings_name_only_weight_check
  CHECK (name_only_match_weight >= 0 AND name_only_match_weight <= 1);

COMMIT;
