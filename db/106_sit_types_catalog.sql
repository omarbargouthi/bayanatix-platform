-- Reworks SIT (Sensitive Information Type) into its own standalone catalog,
-- decoupled from Business Glossary terms and from the "SIT" tag (db/105 — now
-- superseded). "Adding SIT to a business term" means associating that term with
-- one of these catalog values (National ID, Email Address, IBAN, ...) via a
-- tag-like picker — it is NOT adding a fixed tag named "SIT" to the term.
--
-- Why: a term like "Customer Email" or "Client SSN" is a business concept the
-- glossary already models; the *SIT value* it represents (Email Address, National
-- ID) is a separate, much smaller, technical taxonomy with region-scoped detection
-- patterns. Conflating the two (as db/104/db/105 did) meant every SIT-detectable
-- concept needed its own full glossary-term entry. Splitting them lets any
-- existing business term — regardless of which domain/subdomain it lives in —
-- point at the SIT catalog value it represents.

-- ── 1. sit_types — the standalone catalog ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.sit_types (
  sit_type_id           serial PRIMARY KEY,
  sit_name              varchar(100) NOT NULL,
  classification_code   varchar(20) REFERENCES bayanat.classification_types(class_code),
  description           text,
  created_at_timestamp  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sit_types_name_unique UNIQUE (sit_name)
);

-- Seed from the 19 business-glossary rows db/104 originally built as SIT
-- definitions (identified as every term that already has a sit_patterns row).
INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
SELECT DISTINCT g.term_name_text, g.classification_code, g.definition_text
FROM bayanat.business_glossaries g
WHERE g.glossary_id IN (SELECT DISTINCT glossary_id FROM bayanat.sit_patterns)
ON CONFLICT (sit_name) DO NOTHING;

-- ── 2. sit_patterns now belongs to a sit_type, not a glossary term ─────────────

ALTER TABLE bayanat.sit_patterns ADD COLUMN IF NOT EXISTS sit_type_id int4;

UPDATE bayanat.sit_patterns sp
SET sit_type_id = st.sit_type_id
FROM bayanat.business_glossaries g
JOIN bayanat.sit_types st ON st.sit_name = g.term_name_text
WHERE sp.glossary_id = g.glossary_id AND sp.sit_type_id IS NULL;

ALTER TABLE bayanat.sit_patterns ALTER COLUMN sit_type_id SET NOT NULL;
ALTER TABLE bayanat.sit_patterns ADD CONSTRAINT sit_patterns_sit_type_fkey
  FOREIGN KEY (sit_type_id) REFERENCES bayanat.sit_types(sit_type_id) ON DELETE CASCADE;
ALTER TABLE bayanat.sit_patterns DROP CONSTRAINT IF EXISTS sit_patterns_glossary_id_fkey;
ALTER TABLE bayanat.sit_patterns DROP COLUMN IF EXISTS glossary_id;

CREATE INDEX IF NOT EXISTS idx_sit_patterns_type ON bayanat.sit_patterns(sit_type_id);

-- ── 3. business_term_sit_types — the association itself ────────────────────────
-- "Adding SIT to a business term" = a row here. A term can carry more than one
-- SIT association (picker is multi-select, same interaction shape as tagging),
-- though in practice most terms will have exactly one.

CREATE TABLE IF NOT EXISTS bayanat.business_term_sit_types (
  id            serial PRIMARY KEY,
  glossary_id   int4 NOT NULL REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE,
  sit_type_id   int4 NOT NULL REFERENCES bayanat.sit_types(sit_type_id) ON DELETE CASCADE,
  assigned_by   varchar(100) REFERENCES bayanat.users(user_id),
  assigned_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT business_term_sit_types_unique UNIQUE (glossary_id, sit_type_id)
);

CREATE INDEX IF NOT EXISTS idx_business_term_sit_types_glossary ON bayanat.business_term_sit_types(glossary_id);
CREATE INDEX IF NOT EXISTS idx_business_term_sit_types_type ON bayanat.business_term_sit_types(sit_type_id);

-- Backfill: each of the 19 curated business terms is self-associated with its
-- own same-named catalog entry (they were built as 1:1 twins in db/104).
INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM bayanat.business_glossaries g
JOIN bayanat.sit_types st ON st.sit_name = g.term_name_text
ON CONFLICT DO NOTHING;

-- "Customer Email" (glossary_id 16, pre-existing seed term) was tagged "SIT" by
-- hand while testing the previous (now-superseded) tag-based mechanism — the
-- clear intended association is the Email Address SIT type.
INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT 16, (SELECT sit_type_id FROM bayanat.sit_types WHERE sit_name = 'Email Address')
WHERE EXISTS (SELECT 1 FROM bayanat.business_glossaries WHERE glossary_id = 16)
ON CONFLICT DO NOTHING;

-- ── 4. Remove the superseded "SIT" tag mechanism (db/105) ──────────────────────

DELETE FROM bayanat.asset_tags
WHERE asset_type_code = 'BUSINESS_GLOSSARIES'
  AND tag_id = (SELECT tag_id FROM bayanat.tags WHERE tag_name = 'SIT' AND parent_tag_id IS NULL);

DELETE FROM bayanat.tags WHERE tag_name = 'SIT' AND parent_tag_id IS NULL;
