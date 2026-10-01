-- Splits the four SIT types that were shared across KSA and Canada (patterns
-- for both countries living on the same catalog row) into one entry per
-- country, with any genuinely common pattern staying GLOBAL-scoped on the
-- original entry -- same relationship "Postal Code (KSA)"/"Postal Code (CA)"
-- already have to the shared "Postal Code" term, applied consistently now.
--
-- Why: the admin catalog's per-country "Enable all" / "Disable all" action
-- (migration 131) couldn't disable Canada's National ID/Passport/Phone/Bank
-- Account patterns without also disabling KSA's, since they were literally
-- the same sit_types row. Splitting them makes the two countries fully
-- independent, as they already were for every OTHER SIT type.
--
-- Passport Number / Phone Number / Bank Account Number each already had one
-- GLOBAL (region-agnostic) pattern -- that stays on the original, unsplit
-- entry; only the KSA-specific and CA-specific pattern rows move out to new
-- "(KSA)"/"(CA)" entries. National ID had no GLOBAL pattern at all (its two
-- NAME_REGEX rows differ by language, so neither is really region-agnostic),
-- so it's recreated directly as two entries instead of split-and-kept.
--
-- Every new split entry is linked (business_term_sit_types) to the exact same
-- glossary term(s) the original type was linked to, so existing "add SIT to
-- a business term" associations keep working with no re-linking needed.

-- ── Passport Number, Phone Number, Bank Account Number ─────────────────────────
-- (keep the original entry holding only its GLOBAL pattern)

INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
SELECT t.name, st.classification_code, t.description_text
FROM (VALUES
  ('Passport Number (KSA)',     'Passport Number', 'KSA-specific pattern split out of the shared "Passport Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.'),
  ('Passport Number (CA)',      'Passport Number', 'Canada-specific pattern split out of the shared "Passport Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.'),
  ('Phone Number (KSA)',        'Phone Number',    'KSA-specific pattern split out of the shared "Phone Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.'),
  ('Phone Number (CA)',         'Phone Number',    'Canada-specific pattern split out of the shared "Phone Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.'),
  ('Bank Account Number (KSA)', 'Bank Account Number', 'KSA-specific patterns (IBAN format + checksum) split out of the shared "Bank Account Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.'),
  ('Bank Account Number (CA)',  'Bank Account Number', 'Canada-specific patterns split out of the shared "Bank Account Number" SIT type -- its GLOBAL name-regex pattern stays on the original entry.')
) AS t(name, orig_name, description_text)
JOIN bayanat.sit_types st ON st.sit_name = t.orig_name
ON CONFLICT (sit_name) DO NOTHING;

UPDATE bayanat.sit_types SET description =
  'A unique identifier assigned to an individual''s passport by the issuing authority. This entry now holds only the GLOBAL (region-agnostic) name signal -- see "Passport Number (KSA)" / "Passport Number (CA)" for region-specific value-pattern detection.'
WHERE sit_name = 'Passport Number';

UPDATE bayanat.sit_types SET description =
  'A numeric code assigned to a mobile phone that allows voice/SMS communication with an individual. This entry now holds only the GLOBAL (region-agnostic) name signal -- see "Phone Number (KSA)" / "Phone Number (CA)" for region-specific value-pattern detection.'
WHERE sit_name = 'Phone Number';

UPDATE bayanat.sit_types SET description =
  'A bank account identifier used for financial transactions. This entry now holds only the GLOBAL (region-agnostic) name signal -- see "Bank Account Number (KSA)" / "Bank Account Number (CA)" for region-specific value-pattern and checksum detection.'
WHERE sit_name = 'Bank Account Number';

-- Move each region's patterns off the original entry onto its new split entry.
UPDATE bayanat.sit_patterns sp
SET sit_type_id = newst.sit_type_id
FROM bayanat.sit_types origst, bayanat.sit_types newst
WHERE sp.sit_type_id = origst.sit_type_id
  AND ( (origst.sit_name = 'Passport Number'     AND sp.region_code = 'KSA' AND newst.sit_name = 'Passport Number (KSA)')
     OR (origst.sit_name = 'Passport Number'     AND sp.region_code = 'CA'  AND newst.sit_name = 'Passport Number (CA)')
     OR (origst.sit_name = 'Phone Number'        AND sp.region_code = 'KSA' AND newst.sit_name = 'Phone Number (KSA)')
     OR (origst.sit_name = 'Phone Number'        AND sp.region_code = 'CA'  AND newst.sit_name = 'Phone Number (CA)')
     OR (origst.sit_name = 'Bank Account Number' AND sp.region_code = 'KSA' AND newst.sit_name = 'Bank Account Number (KSA)')
     OR (origst.sit_name = 'Bank Account Number' AND sp.region_code = 'CA'  AND newst.sit_name = 'Bank Account Number (CA)')
  );

-- Link every new split entry to the same glossary term(s) its original was linked to.
INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT DISTINCT bts.glossary_id, newst.sit_type_id
FROM bayanat.business_term_sit_types bts
JOIN bayanat.sit_types origst ON origst.sit_type_id = bts.sit_type_id
JOIN bayanat.sit_types newst ON newst.sit_name IN (
  'Passport Number (KSA)', 'Passport Number (CA)',
  'Phone Number (KSA)', 'Phone Number (CA)',
  'Bank Account Number (KSA)', 'Bank Account Number (CA)'
)
WHERE origst.sit_name || ' (KSA)' = newst.sit_name OR origst.sit_name || ' (CA)' = newst.sit_name
ON CONFLICT DO NOTHING;

-- ── National ID — recreated directly as two country entries ───────────────────
-- (the original "National ID" type, with no GLOBAL pattern to preserve, no
-- longer exists on this dev DB -- recreated here from its last known state
-- rather than split-from-source, so this migration doesn't depend on a row
-- that may already be gone.)

INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
VALUES
  ('National ID (KSA)', 'RESTRICTED', 'A government-issued 10-digit identification number assigned to a Saudi national or Iqama holder.'),
  ('National ID (CA)',  'RESTRICTED', 'A Canadian Social Insurance Number (SIN), the national personal identifier used for identity, tax, and employment purposes.')
ON CONFLICT (sit_name) DO NOTHING;

INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT st.sit_type_id, p.region, p.ptype, p.ptext, p.weight, p.notes
FROM (VALUES
  ('National ID (KSA)', 'KSA', 'VALUE_REGEX', '^1\d{9}$',       0.6, 'KSA National ID: starts with 1, 10 digits'),
  ('National ID (KSA)', 'KSA', 'NAME_REGEX',  '(national.?id|national.?number|هوية.?وطنية)', 0.3, NULL),
  ('National ID (KSA)', 'KSA', 'CHECKSUM',    'SA_NATIONAL_ID', 0.9, 'Community-verified Luhn-variant check digit — not an officially published government spec'),
  ('National ID (CA)',  'CA',  'VALUE_REGEX', '^\d{9}$',        0.4, 'Canadian SIN: 9 plain digits -- weak shape alone, many 9-digit fields exist (see CHECKSUM below)'),
  ('National ID (CA)',  'CA',  'CHECKSUM',    'LUHN',           0.9, 'Canada SIN uses the standard Luhn algorithm -- Service Canada''s published check-digit rule, same function already used for credit cards'),
  ('National ID (CA)',  'CA',  'NAME_REGEX',  '(social.?insurance|^sin$|num[ée]ro.?d.?assurance.?sociale|\bnas\b)', 0.3, NULL)
) AS p(sit_name, region, ptype, ptext, weight, notes)
JOIN bayanat.sit_types st ON st.sit_name = p.sit_name
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.sit_patterns sp
  WHERE sp.sit_type_id = st.sit_type_id AND sp.region_code = p.region AND sp.pattern_type = p.ptype AND sp.pattern_text = p.ptext
);

-- Last known associations (National ID / National ID Number / Customer
-- National ID, glossary_ids 15/80/119) -- re-linked to both new entries.
INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM bayanat.business_glossaries g, bayanat.sit_types st
WHERE g.glossary_id IN (15, 80, 119) AND st.sit_name IN ('National ID (KSA)', 'National ID (CA)')
ON CONFLICT DO NOTHING;
