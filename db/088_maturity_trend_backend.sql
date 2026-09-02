-- Repurpose bayanat.maturity_trends as the real backend for the dashboard's
-- maturity trend graph: drop the NAII column (NAII is its own framework now,
-- tracked separately) and widen the score column/constraint to hold the
-- actual weighted overall maturity score (0-5, 2dp) computed from live
-- domain data, instead of the old hand-typed NDI/NAII placeholder pair.

ALTER TABLE bayanat.maturity_trends DROP COLUMN IF EXISTS naii_score;

ALTER TABLE bayanat.maturity_trends
  ALTER COLUMN ndi_score TYPE numeric(3,2);

ALTER TABLE bayanat.maturity_trends
  DROP CONSTRAINT IF EXISTS maturity_trends_ndi_score_check;

ALTER TABLE bayanat.maturity_trends
  RENAME COLUMN ndi_score TO maturity_score;

ALTER TABLE bayanat.maturity_trends
  ADD CONSTRAINT maturity_trends_maturity_score_check
  CHECK (maturity_score >= 0 AND maturity_score <= 5);

-- Old hand-typed placeholder history no longer reflects anything computed —
-- scripts/backfill-maturity-trends.mjs reseeds it from the real live score.
TRUNCATE TABLE bayanat.maturity_trends;
