-- Reworks how a business-glossary term becomes a Sensitive Information Type (SIT):
-- from the bespoke `is_sit_indicator` boolean (+ dedicated checkbox in the Term Edit
-- modal, added in db/104) to the existing generic Tags feature (bayanat.tags +
-- bayanat.asset_tags — already used to tag columns/tables/schemas/sources). A term
-- becomes SIT-eligible by having the "SIT" tag assigned to it, exactly like tagging
-- any other asset — no bespoke column, checkbox, or admin surface needed for the
-- association itself. lib/sit-classification-runner.ts now requires this tag (not
-- just "a pattern happens to exist") before a term's patterns are used in a run.

-- ── 1. The "SIT" tag ────────────────────────────────────────────────────────────

INSERT INTO bayanat.tags (tag_name, color_hex, description)
SELECT 'SIT', '#DC2626', 'Sensitive Information Type — eligible for automatic pattern-based column detection (Enrichment → Sensitive Info Types). Assign via the Tags picker on a Business Glossary term, then add its detection patterns under Admin → Configuration → Sensitive Information Types.'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.tags WHERE tag_name = 'SIT' AND parent_tag_id IS NULL);

-- ── 2. Backfill: every term db/104 flagged is_sit_indicator=true gets the tag ──

INSERT INTO bayanat.asset_tags (tag_id, asset_type_code, asset_id)
SELECT (SELECT tag_id FROM bayanat.tags WHERE tag_name = 'SIT' AND parent_tag_id IS NULL), 'BUSINESS_GLOSSARIES', g.glossary_id
FROM bayanat.business_glossaries g
WHERE g.is_sit_indicator = true
ON CONFLICT DO NOTHING;

-- ── 3. Drop the now-superseded column ──────────────────────────────────────────

ALTER TABLE bayanat.business_glossaries DROP COLUMN IF EXISTS is_sit_indicator;
