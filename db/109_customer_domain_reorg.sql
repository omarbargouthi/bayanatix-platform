-- Bundles customer information under the existing "Customer & Marketing" domain
-- (glossary_id=3) into two subdomains: identifier information (name/ID/email) and
-- sensitive information (health/biometric). Re-parents the two existing customer
-- terms that were scattered elsewhere (Customer Email was oddly under Finance;
-- Customer Full Name sat directly under the domain with no subdomain) rather than
-- duplicating them — same "don't create redundant twins" lesson as db/107.

-- ── 1. Subdomains under Customer & Marketing ───────────────────────────────────

INSERT INTO bayanat.business_glossaries (parent_glossary_id, term_name_text, definition_text, term_type)
SELECT 3, sub.name, sub.def, 'SUBDOMAIN'
FROM (VALUES
  ('Customer Identifier Information', 'Attributes that identify a specific customer — name, identification number, contact email.'),
  ('Customer Sensitive Information',  'Special-category data about a customer requiring the highest handling restrictions — health, biometric, and genetic data.')
) AS sub(name, def)
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = sub.name AND g.parent_glossary_id = 3);

-- ── 2. Re-parent existing customer terms into the new identifier subdomain ────

UPDATE bayanat.business_glossaries
SET parent_glossary_id = (SELECT glossary_id FROM bayanat.business_glossaries WHERE term_name_text = 'Customer Identifier Information' AND parent_glossary_id = 3)
WHERE glossary_id IN (
  SELECT glossary_id FROM bayanat.business_glossaries WHERE term_name_text IN ('Customer Email', 'Customer Full Name') AND term_type = 'TERM'
);

-- ── 3. New "Customer National ID" term, associated with the existing SIT type ──

INSERT INTO bayanat.business_glossaries
  (parent_glossary_id, term_name_text, definition_text, format_text, example_text, classification_code, is_pii_indicator, pi_category_code)
SELECT sd.glossary_id, 'Customer National ID', 'The national identification or Iqama number recorded for a customer during onboarding/KYC.',
       '1NNNNNNNNN or 2NNNNNNNNN (10 digits)', '1234567897', 'RESTRICTED', true, 'DIRECT_ID'
FROM bayanat.business_glossaries sd WHERE sd.term_name_text = 'Customer Identifier Information' AND sd.parent_glossary_id = 3
  AND NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = 'Customer National ID' AND g.parent_glossary_id = sd.glossary_id);

-- ── 4. New "DNA Profile" SIT type (no existing catalog entry fits) ─────────────

INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
SELECT 'DNA Profile', 'SECRET', 'Genetic/DNA profile data used to uniquely and permanently identify an individual.'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.sit_types WHERE sit_name = 'DNA Profile');

INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT st.sit_type_id, 'GLOBAL', 'NAME_REGEX', '(dna|genetic.?profile|genetic.?data|الحمض.?النووي)', 0.4, 'No public value-format spec — name-driven only'
FROM bayanat.sit_types st WHERE st.sit_name = 'DNA Profile'
  AND NOT EXISTS (SELECT 1 FROM bayanat.sit_patterns sp WHERE sp.sit_type_id = st.sit_type_id AND sp.pattern_type = 'NAME_REGEX' AND sp.region_code = 'GLOBAL');

-- ── 5. New customer sensitive-information terms ────────────────────────────────

INSERT INTO bayanat.business_glossaries
  (parent_glossary_id, term_name_text, definition_text, classification_code, is_pii_indicator, pi_category_code)
SELECT sd.glossary_id, t.name, t.def, t.classification, true, t.pi_category
FROM (VALUES
  ('Customer Health Record',  'A customer''s medical history, diagnoses, and treatment records held for insurance/eligibility purposes.', 'SECRET', 'HEALTH'),
  ('Customer Fingerprint',    'Fingerprint biometric data captured for customer identity verification.', 'SECRET', 'BIOMETRIC'),
  ('Customer Facial Print',   'Facial-recognition biometric data captured for customer identity verification.', 'SECRET', 'BIOMETRIC'),
  ('Customer DNA Profile',    'Genetic/DNA profile data collected for a customer (e.g. for specialized health or insurance products).', 'SECRET', 'BIOMETRIC')
) AS t(name, def, classification, pi_category)
JOIN bayanat.business_glossaries sd ON sd.term_name_text = 'Customer Sensitive Information' AND sd.parent_glossary_id = 3
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = t.name AND g.parent_glossary_id = sd.glossary_id);

-- ── 6. Associate the new customer terms with their SIT type ────────────────────

INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM (VALUES
  ('Customer National ID',    'National ID'),
  ('Customer Health Record',  'Health Records'),
  ('Customer Fingerprint',    'Fingerprints'),
  ('Customer Facial Print',   'Facial Print'),
  ('Customer DNA Profile',    'DNA Profile')
) AS assoc(term_name, sit_name)
JOIN bayanat.sit_types st ON st.sit_name = assoc.sit_name
JOIN bayanat.business_glossaries g ON g.term_name_text = assoc.term_name AND g.term_type = 'TERM'
  AND g.parent_glossary_id IN (
    SELECT glossary_id FROM bayanat.business_glossaries
    WHERE term_type = 'SUBDOMAIN' AND parent_glossary_id = 3
      AND term_name_text IN ('Customer Identifier Information', 'Customer Sensitive Information')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.business_term_sit_types bts WHERE bts.glossary_id = g.glossary_id AND bts.sit_type_id = st.sit_type_id
);
