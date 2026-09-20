-- Sensitive Information Type (SIT) Classification.
-- Layers on top of the existing Column Asset-Type (Business/Technical) classifier
-- (db/065_column_classification.sql, lib/classification-runner.ts): once a column is
-- a CONFIRMED Business asset, this feature suggests *which* business-glossary term it
-- represents when that term is a Sensitive Information Type — a term with a defined
-- value format/regex/checksum (National ID, IBAN, Credit Card, ...) — by sampling live
-- column values and scoring them against region-scoped patterns. Mirrors the existing
-- feature's suggestion/confidence/non-destructive-review lifecycle deliberately, so the
-- app has one consistent classification pattern instead of two divergent ones.
--
-- Seed content curated from "Data Classification Terms v1.xlsx" (DG Files/Classification
-- terms and categorization) — only the subset of that spreadsheet's ~80 rows that are
-- genuinely pattern-detectable (have a real, distinct value format) is seeded here as
-- SIT-flagged terms with real patterns; category-level/narrative rows (KPIs, Compliance
-- Reports, Balance Sheets, etc.) are out of scope for this feature. A few terms beyond
-- the spreadsheet (VAT Number, CR Number, GOSI Number, API Key/Credential) are added as
-- best-practice SIT categories every major DLP catalog (Purview, Macie, Google DLP)
-- treats as first-class, flagged [NEW] in comments below.

-- ── 1. business_glossaries: SIT flag ───────────────────────────────────────────

ALTER TABLE bayanat.business_glossaries
  ADD COLUMN IF NOT EXISTS is_sit_indicator boolean NOT NULL DEFAULT false;

-- ── 2. sit_regions — region lookup ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.sit_regions (
  region_code       varchar(10) PRIMARY KEY,
  region_name_text  varchar(100) NOT NULL
);

INSERT INTO bayanat.sit_regions (region_code, region_name_text) VALUES
  ('GLOBAL', 'Global (region-agnostic)'),
  ('KSA',    'Kingdom of Saudi Arabia')
ON CONFLICT (region_code) DO NOTHING;

-- ── 3. sit_patterns — region-scoped detection patterns per term ────────────────
-- Region lives on the PATTERN, not the term: "National ID" stays one glossary term
-- everywhere; adding Canada later is purely new rows against the same glossary_id,
-- no schema change. GLOBAL patterns (email, Luhn credit card) apply regardless of
-- the active region. pattern_text holds a regex source for NAME_REGEX/VALUE_REGEX,
-- or a fixed algorithm key ('LUHN','IBAN_MOD97','SA_NATIONAL_ID') for CHECKSUM rows
-- — checksums aren't expressible as a regex, resolved via a small lookup in
-- lib/sit-classifier.ts instead.

CREATE TABLE IF NOT EXISTS bayanat.sit_patterns (
  pattern_id          serial PRIMARY KEY,
  glossary_id         int4 NOT NULL REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE,
  region_code         varchar(10) NOT NULL REFERENCES bayanat.sit_regions(region_code),
  pattern_type        varchar(20) NOT NULL,
  pattern_text        varchar(500) NOT NULL,
  confidence_weight   numeric(4,3) NOT NULL DEFAULT 0.3,
  is_enabled          boolean NOT NULL DEFAULT true,
  notes_text          text,
  created_at_timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sit_patterns_type_check CHECK (pattern_type IN ('NAME_REGEX','VALUE_REGEX','CHECKSUM'))
);

CREATE INDEX IF NOT EXISTS idx_sit_patterns_region ON bayanat.sit_patterns(region_code) WHERE is_enabled;
CREATE INDEX IF NOT EXISTS idx_sit_patterns_glossary ON bayanat.sit_patterns(glossary_id);

-- ── 4. sit_settings — singleton config (mirrors enrichment_settings, db/093) ───

CREATE TABLE IF NOT EXISTS bayanat.sit_settings (
  settings_id             int4 PRIMARY KEY DEFAULT 1,
  active_region_code      varchar(10) NOT NULL DEFAULT 'KSA' REFERENCES bayanat.sit_regions(region_code),
  sample_size             int4 NOT NULL DEFAULT 200,
  min_confidence_threshold numeric(4,3) NOT NULL DEFAULT 0.5,
  auto_accept_band        varchar(10) NOT NULL DEFAULT 'NONE',
  CONSTRAINT sit_settings_single_row CHECK (settings_id = 1),
  CONSTRAINT sit_settings_auto_accept_check CHECK (auto_accept_band IN ('NONE','HIGH'))
);

INSERT INTO bayanat.sit_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;

-- ── 5. data_attributes — SIT suggestion tracking (sibling to db/065's columns) ─
-- Uses REJECTED (not OVERRIDDEN) for "confirmed not sensitive" — a genuinely new
-- status, distinct from the existing feature's OVERRIDDEN semantics ("confirmed a
-- different value than suggested"): here a steward isn't picking an alternate term,
-- they're rejecting the suggestion outright. Reassigning to a different SIT term
-- still lands in ACCEPTED (same write path as accept, just with a steward-chosen
-- glossary_id instead of the suggested one).

ALTER TABLE bayanat.data_attributes
  ADD COLUMN IF NOT EXISTS suggested_sit_glossary_id  int4 REFERENCES bayanat.business_glossaries(glossary_id),
  ADD COLUMN IF NOT EXISTS sit_suggestion_confidence  numeric(4,3),
  ADD COLUMN IF NOT EXISTS sit_suggestion_rationale_json jsonb,
  ADD COLUMN IF NOT EXISTS sit_suggestion_status_code varchar(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS sit_classified_by_user_id  varchar(100),
  ADD COLUMN IF NOT EXISTS sit_classified_at_timestamp timestamp;

ALTER TABLE bayanat.data_attributes
  ADD CONSTRAINT data_attributes_sit_suggestion_status_check
  CHECK (sit_suggestion_status_code IN ('NONE','PENDING','ACCEPTED','REJECTED','STALE'));

-- ── 6. sit_classification_runs — run log (sibling to classification_runs) ─────

CREATE TABLE IF NOT EXISTS bayanat.sit_classification_runs (
  run_id                      serial PRIMARY KEY,
  scope_type_code             varchar(20) NOT NULL,
  scope_id                    int4,
  region_code                 varchar(10),
  triggered_by_user_id        varchar(100),
  status_code                 varchar(20) NOT NULL DEFAULT 'RUNNING',
  started_at                  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at                 timestamp,
  attributes_evaluated_count  int4 DEFAULT 0,
  suggestions_changed_count   int4 DEFAULT 0,
  summary_json                jsonb,
  CONSTRAINT sit_classification_runs_scope_type_check
    CHECK (scope_type_code IN ('DATA_SOURCE','SCHEMA','ENTITY','FULL')),
  CONSTRAINT sit_classification_runs_status_check
    CHECK (status_code IN ('RUNNING','COMPLETED','FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_sit_classification_runs_scope ON bayanat.sit_classification_runs(scope_type_code, scope_id);

-- ── 7. Glossary seed — curated SIT terms, nested under existing/new domains ────
-- New "IT & Technical Data" top-level domain for the technical/credential terms —
-- none of the 5 existing domains (Finance, HR & Workforce, Customer & Marketing,
-- Compliance & Privacy, Reference Data (KSA)) fit that content.

INSERT INTO bayanat.business_glossaries (term_name_text, definition_text, term_type, classification_code)
SELECT 'IT & Technical Data', 'Technical identifiers, credentials, and infrastructure metadata that require restricted handling even though they are not personal data.', 'DOMAIN', 'RESTRICTED'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries WHERE term_name_text = 'IT & Technical Data' AND parent_glossary_id IS NULL);

-- Sub-domains, one per spreadsheet category actually used below, nested under the
-- relevant existing/new top-level domain. Finance=1, HR & Workforce=2,
-- Customer & Marketing=3 (see db/005_glossary_seed.sql).
INSERT INTO bayanat.business_glossaries (parent_glossary_id, term_name_text, definition_text, term_type)
SELECT p.glossary_id, sub.name, sub.def, 'SUBDOMAIN'
FROM (VALUES
  (3, 'Identification Data', 'Personal identifiers and contact details used to identify a specific individual.'),
  (3, 'Sensitive Data',      'Health, biometric, and other special-category personal data requiring the highest handling restrictions.'),
  (1, 'Financial Data',      'Personal and corporate financial identifiers — account numbers, payment instruments, tax registrations.'),
  (2, 'Employment Data',     'Compensation and workforce identifiers tied to a specific employee.'),
  (NULL, 'Technical Data',   'Credentials, keys, and identifiers used by systems rather than end users.')
) AS sub(parent_id, name, def)
JOIN bayanat.business_glossaries p
  ON p.glossary_id = COALESCE(sub.parent_id, (SELECT glossary_id FROM bayanat.business_glossaries WHERE term_name_text = 'IT & Technical Data' AND parent_glossary_id IS NULL))
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = sub.name AND g.parent_glossary_id = p.glossary_id
);

-- Terms — is_pii_indicator=true reuses the existing PII badge / Sample Data masking
-- machinery (lib/sample-data.ts::getPiColumnNames) automatically once a column is
-- linked via asset_business_terms; corporate/technical terms are SIT but not PII.
INSERT INTO bayanat.business_glossaries
  (parent_glossary_id, term_name_text, definition_text, format_text, example_text,
   classification_code, is_pii_indicator, pi_category_code, is_sit_indicator)
SELECT sd.glossary_id, t.name, t.def, t.format, t.example, t.classification, t.is_pii, t.pi_category, true
FROM (VALUES
  ('Identification Data', 'National ID', 'A government-issued 10-digit identification number assigned to a Saudi national.', '1NNNNNNNNN (10 digits, starts with 1)', '1234567890', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Identification Data', 'Iqama Number', 'A government-issued 10-digit residence identification number assigned to a non-Saudi resident.', '2NNNNNNNNN (10 digits, starts with 2)', '2345678901', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Identification Data', 'Passport Number', 'A unique identifier assigned to an individual''s passport by the issuing authority.', 'Letter + 8 digits (KSA format)', 'A12345678', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Identification Data', 'Phone Number', 'A numeric code assigned to a mobile phone that allows voice/SMS communication with an individual.', 'KSA mobile: 05NNNNNNNN or +9665NNNNNNNN', '+966512345678', 'RESTRICTED', true, 'CONTACT'),
  ('Identification Data', 'Email Address', 'An electronic mail address used for sending and receiving email communications.', 'local-part@domain', 'name@example.com', 'PUBLIC', true, 'CONTACT'),
  ('Identification Data', 'DoB', 'The date of birth for a person, in Gregorian or Hijri calendar.', 'YYYY-MM-DD', '1990-05-14', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Sensitive Data', 'Health Records', 'Detailed documentation of an individual''s medical history, including diagnoses, treatments, and health conditions.', 'Free text / structured medical record', NULL, 'SECRET', true, 'HEALTH'),
  ('Sensitive Data', 'Prescriptions', 'Information about medications prescribed to an individual, including drug names, dosages, and duration.', 'Free text / structured prescription record', NULL, 'SECRET', true, 'HEALTH'),
  ('Sensitive Data', 'Fingerprints', 'Unique patterns on an individual''s fingertips used for identification.', 'Biometric template / image', NULL, 'SECRET', true, 'BIOMETRIC'),
  ('Sensitive Data', 'Facial Print', 'Technology that uses facial features to identify an individual.', 'Biometric template / image', NULL, 'SECRET', true, 'BIOMETRIC'),
  ('Financial Data', 'Bank Account Number', 'A unique IBAN identifier for an individual or organization''s bank account used for financial transactions.', 'SA + 22 digits (KSA IBAN)', 'SA0380000000608010167519', 'RESTRICTED', true, 'FINANCIAL'),
  ('Financial Data', 'Credit Card Details', 'Information related to a credit card, including the card number.', '13-19 digit PAN (Luhn-valid)', '4111111111111111', 'RESTRICTED', true, 'FINANCIAL'),
  ('Financial Data', 'VAT Number', 'The 15-digit VAT registration number assigned by ZATCA to a taxable entity.', '3NNNNNNNNNNNNN3 (15 digits, starts/ends with 3)', '300012345600003', 'RESTRICTED', false, NULL),
  ('Financial Data', 'Commercial Registration Number', 'The 10-digit registration number assigned to a business entity by the KSA Ministry of Commerce.', '10 digits', '1010123456', 'RESTRICTED', false, NULL),
  ('Employment Data', 'Employees Salaries and Benefits', 'Compensation and perks employees receive for their work, including base salary, bonuses, and benefits.', 'Decimal amount in local currency', NULL, 'RESTRICTED', true, 'FINANCIAL'),
  ('Employment Data', 'GOSI Number', 'The subscription number assigned to an employee by the General Organization for Social Insurance.', 'Numeric, GOSI-assigned', NULL, 'RESTRICTED', true, 'DIRECT_ID'),
  ('Technical Data', 'Identifiers and Keys', 'Unique codes or keys used to identify and link records within a database.', 'Alphanumeric key/token', NULL, 'RESTRICTED', false, NULL),
  ('Technical Data', 'Source Code', 'The human-readable instructions that a computer can execute to perform a specific task.', 'Source file', NULL, 'RESTRICTED', false, NULL),
  ('Technical Data', 'API Key / Credential Secret', 'A secret token or key used to authenticate an application or service to an API — not called out in the source spreadsheet, but a first-class Sensitive Information Type in every major DLP catalog since a leaked credential grants direct system access.', 'Provider-specific token shape (e.g. AWS AKIA... , generic high-entropy token)', NULL, 'SECRET', false, NULL)
) AS t(subdomain, name, def, format, example, classification, is_pii, pi_category)
JOIN bayanat.business_glossaries sd ON sd.term_name_text = t.subdomain AND sd.term_type = 'SUBDOMAIN'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = t.name AND g.parent_glossary_id = sd.glossary_id
);

-- ── 8. Patterns per term ────────────────────────────────────────────────────────
-- confidence_weight defaults: NAME_REGEX 0.3 (weak signal alone), VALUE_REGEX 0.6
-- (a real format match), CHECKSUM 0.9 (validated, near-conclusive) — combined
-- additively and capped at 1.0 in lib/sit-classifier.ts, so a term with both a
-- VALUE_REGEX and CHECKSUM pattern that both hit reaches HIGH confidence on its own.

INSERT INTO bayanat.sit_patterns (glossary_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT g.glossary_id, p.region, p.ptype, p.ptext, p.weight, p.notes
FROM (VALUES
  ('National ID',   'KSA',    'VALUE_REGEX', '^1\d{9}$',                         0.6, 'KSA National ID: starts with 1, 10 digits'),
  ('National ID',   'KSA',    'CHECKSUM',    'SA_NATIONAL_ID',                    0.9, 'Community-verified Luhn-variant check digit — not an officially published government spec'),
  ('National ID',   'KSA',    'NAME_REGEX',  '(national.?id|national.?number|هوية.?وطنية)', 0.3, NULL),

  ('Iqama Number',  'KSA',    'VALUE_REGEX', '^2\d{9}$',                         0.6, 'KSA Iqama: starts with 2, 10 digits'),
  ('Iqama Number',  'KSA',    'CHECKSUM',    'SA_NATIONAL_ID',                    0.9, 'Same check-digit family as National ID'),
  ('Iqama Number',  'KSA',    'NAME_REGEX',  '(iqama|residency.?number|رقم.?الإقامة)', 0.3, NULL),

  ('Passport Number', 'KSA',  'VALUE_REGEX', '^[A-Za-z]\d{8}$',                  0.5, 'KSA passport format: 1 letter + 8 digits'),
  ('Passport Number', 'GLOBAL','NAME_REGEX', '(passport)',                       0.3, NULL),

  ('Phone Number', 'KSA',     'VALUE_REGEX', '^(\+?966|0)5\d{8}$',               0.6, 'KSA mobile number'),
  ('Phone Number', 'GLOBAL',  'NAME_REGEX',  '(phone|mobile|هاتف)',              0.3, NULL),

  ('Email Address', 'GLOBAL', 'VALUE_REGEX', '^[^\s@]+@[^\s@]+\.[^\s@]+$',       0.6, 'RFC-lite email pattern, region-agnostic'),
  ('Email Address', 'GLOBAL', 'NAME_REGEX',  '(email|e-?mail|بريد)',             0.3, NULL),

  ('DoB', 'GLOBAL',           'NAME_REGEX',  '(date.?of.?birth|^dob$|birth.?date|تاريخ.?الميلاد)', 0.4, 'Dates alone are low-signal by value; name proximity carries more weight here'),
  ('DoB', 'GLOBAL',           'VALUE_REGEX', '^(19|20)\d{2}-\d{2}-\d{2}$',       0.3, 'ISO date shape — weak on its own, many non-DoB dates match too'),

  ('Bank Account Number', 'KSA', 'VALUE_REGEX', '^SA\d{22}$',                    0.6, 'KSA IBAN'),
  ('Bank Account Number', 'KSA', 'CHECKSUM',    'IBAN_MOD97',                    0.9, 'ISO 7064 mod-97 IBAN checksum'),
  ('Bank Account Number', 'GLOBAL','NAME_REGEX','(iban|bank.?account|account.?number|رقم.?الحساب)', 0.3, NULL),

  ('Credit Card Details', 'GLOBAL', 'VALUE_REGEX', '^\d{13,19}$',               0.4, 'Card-number length shape, low signal alone'),
  ('Credit Card Details', 'GLOBAL', 'CHECKSUM',    'LUHN',                      0.9, 'Standard Luhn checksum'),
  ('Credit Card Details', 'GLOBAL', 'NAME_REGEX',  '(credit.?card|card.?number|pan)', 0.3, NULL),

  ('VAT Number', 'KSA', 'VALUE_REGEX', '^3\d{13}3$',                            0.7, 'ZATCA 15-digit VAT number: starts and ends with 3'),
  ('VAT Number', 'KSA', 'NAME_REGEX',  '(vat|tax.?number|الضريب)',              0.3, NULL),

  ('Commercial Registration Number', 'KSA', 'VALUE_REGEX', '^\d{10}$',          0.4, 'CR number length shape, low signal alone — many 10-digit fields exist'),
  ('Commercial Registration Number', 'KSA', 'NAME_REGEX',  '(commercial.?reg|cr.?number|السجل.?التجاري)', 0.4, NULL),

  ('GOSI Number', 'KSA', 'NAME_REGEX', '(gosi)', 0.4, 'No public value-format spec to validate against — name-driven only'),

  ('Employees Salaries and Benefits', 'GLOBAL', 'NAME_REGEX', '(salary|wage|compensation|benefit|راتب)', 0.4, NULL),

  ('Health Records', 'GLOBAL', 'NAME_REGEX', '(diagnosis|medical|health.?record|prescription|صحي)', 0.4, 'Free-text medical content has no universal value pattern'),
  ('Prescriptions',  'GLOBAL', 'NAME_REGEX', '(prescription|medication|dosage)', 0.4, NULL),
  ('Fingerprints',   'GLOBAL', 'NAME_REGEX', '(fingerprint|biometric.?fp)',      0.4, NULL),
  ('Facial Print',   'GLOBAL', 'NAME_REGEX', '(facial.?print|face.?id|facial.?recognition)', 0.4, NULL),

  ('Identifiers and Keys', 'GLOBAL', 'NAME_REGEX', '(^guid$|^uuid$|api.?key|secret.?key|private.?key)', 0.4, NULL),
  ('Source Code',          'GLOBAL', 'NAME_REGEX', '(source.?code|script.?body|code.?blob)', 0.4, NULL),

  ('API Key / Credential Secret', 'GLOBAL', 'VALUE_REGEX', '^AKIA[0-9A-Z]{16}$', 0.9, 'AWS access key ID shape — near-conclusive on its own'),
  ('API Key / Credential Secret', 'GLOBAL', 'VALUE_REGEX', '^[A-Za-z0-9+/_-]{32,}$', 0.4, 'Generic high-entropy token shape — weak alone, many non-secret values are this long/charset too'),
  ('API Key / Credential Secret', 'GLOBAL', 'NAME_REGEX',  '(api.?key|secret|token|credential|password)', 0.3, NULL)
) AS p(term_name, region, ptype, ptext, weight, notes)
JOIN bayanat.business_glossaries g ON g.term_name_text = p.term_name AND g.is_sit_indicator = true
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.sit_patterns sp
  WHERE sp.glossary_id = g.glossary_id AND sp.region_code = p.region AND sp.pattern_type = p.ptype AND sp.pattern_text = p.ptext
);
