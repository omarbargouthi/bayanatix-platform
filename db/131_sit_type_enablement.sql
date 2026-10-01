-- SIT types gain a type-level enable/disable switch, separate from
-- sit_patterns.is_enabled (which is per-pattern, finer-grained). This is the
-- coarse "this SIT doesn't apply to this customer at all" switch the admin UI
-- needs to let someone enable/disable a whole catalog entry at once, grouped
-- by which country(ies) it's relevant to.

ALTER TABLE bayanat.sit_types
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;
