-- Canada SIT (Sensitive Information Type) patterns, mirroring KSA's coverage.
--
-- bayanat.sit_patterns is keyed by sit_type_id only (migration 106 dropped its
-- glossary_id column) -- sit_types is its own independent catalog, decoupled
-- from business_glossaries (confirmed live: "Phone Number" the SIT type is
-- linked to the "Mobile Number" glossary term; "National ID" links to three
-- different glossary terms across domains; "Postal Code (KSA)" is its own SIT
-- type sharing the generic "Postal Code" glossary term). So most of this is
-- just new sit_patterns rows against EXISTING sit_type_ids, keyed by region.
--
-- Genuinely-shared-concept types (National ID, Passport Number, Phone Number,
-- Bank Account Number) get new CA rows on the SAME existing sit_type. Concepts
-- named after a KSA-specific regulatory term (VAT Registration Number,
-- Commercial Registration Number) get Canada's own distinctly-named
-- equivalents as NEW sit_types instead (GST/HST Number, Business Number) --
-- same reasoning as "Postal Code (KSA)" existing as its own catalog entry
-- rather than overloading one multi-region name. Email Address, Credit Card
-- Details, DoB, and the rest are already GLOBAL (region-agnostic) and need no
-- new rows -- Canada already benefits from those once it's the active region.
--
-- Deliberately NOT seeded: Iqama Number (no clean Canadian equivalent in form
-- or role), a Canadian driver's licence or health card number (both vary by
-- province with no single national format -- fabricating a "pan-Canadian"
-- shape would be dishonest, same restraint already applied to GOSI Number's
-- "no public value-format spec" note in db/104), and the various other
-- KSA-institution-specific types (Zakat, Noor student ID, National Address
-- Code, etc.) that have no real Canadian counterpart.

-- ── 1. Region ────────────────────────────────────────────────────────────────

INSERT INTO bayanat.sit_regions (region_code, region_name_text) VALUES
  ('CA', 'Canada')
ON CONFLICT (region_code) DO NOTHING;

-- ── 2. New Canada-specific terms + SIT types ───────────────────────────────────
-- Parent glossary_id 66 = "Government Revenue & Taxation" subdomain, the same
-- one VAT Registration Number (74) and Commercial Registration Number (92)
-- already live under.

INSERT INTO bayanat.business_glossaries
  (parent_glossary_id, term_name_text, definition_text, format_text, example_text, classification_code, is_pii_indicator)
SELECT 66, t.name, t.def, t.format, t.example, t.classification, false
FROM (VALUES
  ('GST/HST Number',       'The business number plus a program account identifier (RT) and reference number, assigned by the Canada Revenue Agency (CRA) to a GST/HST registrant.', '9 digits + RT + 4 digits', '123456789RT0001', 'INTERNAL'),
  ('Business Number (BN)', 'The 9-digit identifier assigned by the Canada Revenue Agency (CRA) to a business, used as the base for its program accounts (GST/HST, payroll, corporate income tax).', '9 digits', '123456789', 'INTERNAL')
) AS t(name, def, format, example, classification)
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = t.name AND g.parent_glossary_id = 66);

INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
VALUES
  ('GST/HST Number',       'INTERNAL', 'The business number plus a program account identifier (RT) and reference number, assigned by the CRA to a GST/HST registrant.'),
  ('Business Number (BN)', 'INTERNAL', 'The 9-digit identifier assigned by the CRA to a business.'),
  ('Postal Code (CA)',     'PUBLIC',   'The alphanumeric postal code component of a Canadian address, shares the generic "Postal Code" glossary term with Postal Code (KSA).')
ON CONFLICT (sit_name) DO NOTHING;

INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM bayanat.business_glossaries g
JOIN bayanat.sit_types st ON st.sit_name = g.term_name_text
WHERE g.term_name_text IN ('GST/HST Number', 'Business Number (BN)')
ON CONFLICT DO NOTHING;

-- Postal Code (CA) reuses the existing generic "Postal Code" glossary term
-- (glossary_id 95) rather than creating a duplicate term -- same relationship
-- Postal Code (KSA) already has to it.
INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM bayanat.business_glossaries g, bayanat.sit_types st
WHERE g.term_name_text = 'Postal Code' AND st.sit_name = 'Postal Code (CA)'
ON CONFLICT DO NOTHING;

-- ── 3. CA-region patterns on EXISTING shared SIT types ─────────────────────────
-- SIN officially validates via the standard Luhn algorithm (Service Canada's
-- published check-digit rule), so this reuses the existing generic LUHN
-- checksum function (lib/sit-classifier.ts) rather than needing a new one.

INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT st.sit_type_id, p.region, p.ptype, p.ptext, p.weight, p.notes
FROM (VALUES
  ('National ID', 'CA', 'VALUE_REGEX', '^\d{9}$',                                         0.4, 'Canadian SIN: 9 plain digits -- weak shape alone, many 9-digit fields exist (see CHECKSUM below)'),
  ('National ID', 'CA', 'CHECKSUM',    'LUHN',                                              0.9, 'Canada SIN uses the standard Luhn algorithm -- Service Canada''s published check-digit rule, same function already used for credit cards'),
  ('National ID', 'CA', 'NAME_REGEX',  '(social.?insurance|^sin$|num[ée]ro.?d.?assurance.?sociale|\bnas\b)', 0.3, NULL),

  ('Passport Number', 'CA', 'VALUE_REGEX', '^[A-Za-z]{2}\d{6}$', 0.5, 'Canadian e-passport format since 2013: 2 letters + 6 digits'),

  ('Phone Number', 'CA', 'VALUE_REGEX', '^(\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}$', 0.6, 'NANP format -- Canada shares the +1 country code and numbering plan with the US'),

  ('Bank Account Number', 'CA', 'VALUE_REGEX', '^\d{3}-\d{5}-\d{7,12}$', 0.4, 'Institution-transit-account format; account length varies by bank and there is no universal public checksum, unlike IBAN'),
  ('Bank Account Number', 'CA', 'NAME_REGEX',  '(transit.?number|institution.?number|num[ée]ro.?de.?transit)', 0.3, NULL)
) AS p(sit_name, region, ptype, ptext, weight, notes)
JOIN bayanat.sit_types st ON st.sit_name = p.sit_name
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.sit_patterns sp
  WHERE sp.sit_type_id = st.sit_type_id AND sp.region_code = p.region AND sp.pattern_type = p.ptype AND sp.pattern_text = p.ptext
);

-- ── 4. Patterns on the NEW Canada-specific SIT types ───────────────────────────

INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT st.sit_type_id, p.region, p.ptype, p.ptext, p.weight, p.notes
FROM (VALUES
  ('GST/HST Number',       'CA',     'VALUE_REGEX', '^\d{9}RT\d{4}$', 0.7, 'CRA program-account format: 9-digit Business Number + RT + 4-digit reference'),
  ('GST/HST Number',       'CA',     'NAME_REGEX',  '(gst|hst|tax.?registration)', 0.3, NULL),

  ('Business Number (BN)', 'CA',     'VALUE_REGEX', '^\d{9}$', 0.4, 'BN shape alone, low signal -- same 9-digit ambiguity as SIN/other identifiers'),
  ('Business Number (BN)', 'CA',     'NAME_REGEX',  '(business.?number|^bn$|num[ée]ro.?d.?entreprise)', 0.4, NULL),

  ('Postal Code (CA)',     'CA',     'VALUE_REGEX', '^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$', 0.7, 'Canada Post format (letter-digit-letter space digit-letter-digit); simplified -- does not exclude the handful of letters Canada Post never uses (D, F, I, O, Q, U)'),
  ('Postal Code (CA)',     'GLOBAL', 'NAME_REGEX',  '(postal.?code|zip.?code)', 0.4, NULL)
) AS p(sit_name, region, ptype, ptext, weight, notes)
JOIN bayanat.sit_types st ON st.sit_name = p.sit_name
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.sit_patterns sp
  WHERE sp.sit_type_id = st.sit_type_id AND sp.region_code = p.region AND sp.pattern_type = p.ptype AND sp.pattern_text = p.ptext
);
