-- KSA Government "vanilla" Business Glossary configuration — a starter baseline
-- covering the domains a typical Saudi government entity's data governance
-- program would need, for the entity to review and amend as needed (rename,
-- reclassify, add/remove terms — nothing here is meant to be final).
--
-- Deliberately NOT repeating the db/104 mistake (removed in db/107): domains and
-- subdomains here represent real government business areas with substantive
-- terms of their own — most terms carry no SIT association at all. Only the
-- subset that represents a genuinely detectable Sensitive Information Type gets
-- associated with one, via business_term_sit_types exactly like any other term
-- (see the Business Glossary term editor's SIT picker) — SIT is a property a
-- term can carry, never the term's reason for existing.
--
-- New domains: Identity & Civil Affairs, Citizen & Government Services, Public
-- Health & Social Welfare, Education, Justice & Legal Affairs, Transportation &
-- Traffic. Two existing domains (Finance=1, HR & Workforce=2) get a new
-- government-specific subdomain each rather than a duplicate domain.
--
-- New SIT types are added only where no existing catalog entry fits and a real,
-- honestly-scoped pattern exists (mostly NAME_REGEX — no fabricated checksums or
-- official format specs where none are publicly documented; flagged in notes_text
-- exactly like db/104's SA_NATIONAL_ID checksum caveat).

-- ── 1. New domains ──────────────────────────────────────────────────────────────

INSERT INTO bayanat.business_glossaries (term_name_text, definition_text, term_type, classification_code)
SELECT * FROM (VALUES
  ('Identity & Civil Affairs', 'Citizen and resident identity records, civil status, and national address — the foundational identity data every other government service depends on.', 'DOMAIN', 'RESTRICTED'),
  ('Citizen & Government Services', 'Digital identity, authentication, and the service requests/transactions citizens and residents conduct with government entities.', 'DOMAIN', 'INTERNAL'),
  ('Public Health & Social Welfare', 'Patient health records and the social welfare/benefit programs administered on citizens'' and residents'' behalf.', 'DOMAIN', 'CONFIDENTIAL'),
  ('Education', 'Student records, academic history, and higher-education administration across the national education system.', 'DOMAIN', 'CONFIDENTIAL'),
  ('Justice & Legal Affairs', 'Judicial case records and legal instruments administered by the justice system.', 'DOMAIN', 'CONFIDENTIAL'),
  ('Transportation & Traffic', 'Vehicle registration, driver licensing, and traffic administration.', 'DOMAIN', 'INTERNAL')
) AS v(term_name_text, definition_text, term_type, classification_code)
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries WHERE term_name_text = v.term_name_text AND parent_glossary_id IS NULL);

-- ── 2. Subdomains — under the new domains, plus one each under Finance(1)/HR(2) ─

INSERT INTO bayanat.business_glossaries (parent_glossary_id, term_name_text, definition_text, term_type)
SELECT p.glossary_id, sub.name, sub.def, 'SUBDOMAIN'
FROM (VALUES
  ('Identity & Civil Affairs',       'Citizen & Resident Identity',       'Core identity attributes of a citizen or resident.'),
  ('Identity & Civil Affairs',       'National Address',                  'The Saudi National Address system — short address code, building number, postal code.'),
  ('Citizen & Government Services',  'Digital Identity & Authentication', 'Credentials used to authenticate a person or system to a government digital service.'),
  ('Citizen & Government Services',  'Service Requests & Transactions',   'Records of a citizen/resident''s interactions with a government e-service.'),
  ('Public Health & Social Welfare', 'Patient & Health Records',          'Clinical records held by health-sector entities.'),
  ('Public Health & Social Welfare', 'Social Welfare & Benefits',         'Benefit and support-program enrollment records.'),
  ('Education',                      'Student Records',                  'Enrollment and academic records for students.'),
  ('Education',                      'Scholarships & Higher Education',  'Scholarship funding and higher-education administration.'),
  ('Justice & Legal Affairs',        'Judicial Records',                 'Court case and legal instrument records.'),
  ('Transportation & Traffic',       'Vehicle & Licensing',               'Vehicle registration, plates, and driver licensing.'),
  ('Finance',                        'Government Revenue & Taxation',    'Tax, zakat, and government payment identifiers.'),
  ('HR & Workforce',                 'Civil Service Employment',          'Public-sector employment and payroll records.')
) AS sub(domain_name, name, def)
JOIN bayanat.business_glossaries p ON p.term_name_text = sub.domain_name AND p.parent_glossary_id IS NULL
WHERE NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = sub.name AND g.parent_glossary_id = p.glossary_id);

-- ── 3. New SIT types (only where no existing catalog entry fits) ──────────────
-- All NAME_REGEX/VALUE_REGEX only, no checksum — no official public check-digit
-- spec exists for any of these, so none is fabricated (matches db/104's own
-- disclosed-limitation convention for SA_NATIONAL_ID's non-official algorithm).

INSERT INTO bayanat.sit_types (sit_name, classification_code, description)
SELECT * FROM (VALUES
  ('Family Card Number',           'RESTRICTED',   'The household civil registry number (Sijil Al-Usra) linking family members under one civil record.'),
  ('National Address Code',        'RESTRICTED',   'The Saudi National Address short code — 4 letters followed by 4 digits (e.g. RRRD2929).'),
  ('Building Number',              'INTERNAL',     'The 4-digit building identifier component of a Saudi National Address.'),
  ('Postal Code (KSA)',            'PUBLIC',       'The 5-digit postal code component of a Saudi address.'),
  ('Digital Identity Credential',  'SECRET',       'A national digital-identity authentication credential (e.g. Nafath) used to sign in to government e-services.'),
  ('Health Insurance Number',      'RESTRICTED',   'A health insurance policy/member number.'),
  ('Social Welfare Beneficiary ID','RESTRICTED',   'An identifier for a beneficiary enrolled in a government social welfare or support program (e.g. Citizen Account).'),
  ('Student ID (Noor)',            'INTERNAL',     'A student identifier issued by the Ministry of Education''s Noor system, distinct from the student''s National ID.'),
  ('Court Case Number',            'CONFIDENTIAL', 'A judicial case reference number (e.g. from the Najiz system).'),
  ('Vehicle Registration Number',  'INTERNAL',     'The vehicle registration (Istimara) reference number.'),
  ('Vehicle Plate Number',         'INTERNAL',     'A Saudi vehicle license plate number — approximate shape only (letters + digits); the real allowed-character set is narrower than this pattern and not fully codified here.'),
  ('Driving License Number',       'RESTRICTED',   'A driver''s license identification number.'),
  ('Traffic Violation Number',     'INTERNAL',     'A traffic violation citation reference number.'),
  ('Civil Service Employee Number','INTERNAL',     'A government employee''s civil-service personnel number.'),
  ('Zakat Registration Number',    'RESTRICTED',   'A ZATCA Zakat registration identifier for a Zakat-paying entity.')
) AS v(sit_name, classification_code, description)
WHERE NOT EXISTS (SELECT 1 FROM bayanat.sit_types WHERE sit_name = v.sit_name);

INSERT INTO bayanat.sit_patterns (sit_type_id, region_code, pattern_type, pattern_text, confidence_weight, notes_text)
SELECT st.sit_type_id, p.region, p.ptype, p.ptext, p.weight, p.notes
FROM (VALUES
  ('Family Card Number',            'KSA',    'NAME_REGEX',  '(family.?card|sijil.?al.?usra|سجل.?الأسرة)',      0.4, 'No public value-format spec — name-driven only'),
  ('National Address Code',         'KSA',    'VALUE_REGEX', '^[A-Za-z]{4}\d{4}$',                                0.6, 'Saudi National Address short code shape'),
  ('National Address Code',         'KSA',    'NAME_REGEX',  '(national.?address|short.?address|عنوان.?وطني)',    0.3, NULL),
  ('Building Number',               'KSA',    'VALUE_REGEX', '^\d{4}$',                                            0.3, 'Weak alone — many unrelated 4-digit fields exist'),
  ('Building Number',               'KSA',    'NAME_REGEX',  '(building.?number|رقم.?المبنى)',                    0.4, NULL),
  ('Postal Code (KSA)',             'KSA',    'VALUE_REGEX', '^\d{5}$',                                            0.3, 'Weak alone — many unrelated 5-digit fields exist'),
  ('Postal Code (KSA)',             'GLOBAL', 'NAME_REGEX',  '(postal.?code|zip.?code|الرمز.?البريدي)',            0.4, NULL),
  ('Digital Identity Credential',   'KSA',    'NAME_REGEX',  '(nafath|digital.?identity|هوية.?رقمية)',            0.4, NULL),
  ('Health Insurance Number',       'GLOBAL', 'NAME_REGEX',  '(health.?insurance|insurance.?number|التأمين.?الصحي)', 0.4, NULL),
  ('Social Welfare Beneficiary ID', 'KSA',    'NAME_REGEX',  '(beneficiary|citizen.?account|حساب.?المواطن)',       0.4, NULL),
  ('Student ID (Noor)',             'KSA',    'NAME_REGEX',  '(student.?id|noor.?id|رقم.?الطالب)',                0.4, NULL),
  ('Court Case Number',             'KSA',    'NAME_REGEX',  '(case.?number|court.?case|najiz|رقم.?القضية)',       0.4, NULL),
  ('Vehicle Registration Number',   'KSA',    'NAME_REGEX',  '(istimara|vehicle.?registration|رقم.?الاستمارة)',    0.4, NULL),
  ('Vehicle Plate Number',          'KSA',    'VALUE_REGEX', '^[A-Za-z]{1,3}\s?\d{1,4}$',                          0.3, 'Approximate shape only, not the real allowed-character set'),
  ('Vehicle Plate Number',          'KSA',    'NAME_REGEX',  '(plate.?number|license.?plate|رقم.?اللوحة)',        0.4, NULL),
  ('Driving License Number',        'KSA',    'NAME_REGEX',  '(driving.?licen[cs]e|رخصة.?القيادة)',               0.4, NULL),
  ('Traffic Violation Number',      'KSA',    'NAME_REGEX',  '(traffic.?violation|مخالفة.?مرورية)',                0.4, NULL),
  ('Civil Service Employee Number', 'KSA',    'NAME_REGEX',  '(employee.?number|civil.?service.?id|الرقم.?الوظيفي)', 0.4, NULL),
  ('Zakat Registration Number',     'KSA',    'NAME_REGEX',  '(zakat|الزكاة)',                                     0.4, NULL)
) AS p(sit_name, region, ptype, ptext, weight, notes)
JOIN bayanat.sit_types st ON st.sit_name = p.sit_name
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.sit_patterns sp
  WHERE sp.sit_type_id = st.sit_type_id AND sp.region_code = p.region AND sp.pattern_type = p.ptype AND sp.pattern_text = p.ptext
);

-- ── 4. Business terms ───────────────────────────────────────────────────────────
-- is_pii = true for anything identifying a specific natural person; false for
-- entity-level (VAT/CR/Zakat registration numbers identify an organization).

INSERT INTO bayanat.business_glossaries
  (parent_glossary_id, term_name_text, definition_text, classification_code, is_pii_indicator, pi_category_code)
SELECT sd.glossary_id, t.name, t.def, t.classification, t.is_pii, t.pi_category
FROM (VALUES
  -- Identity & Civil Affairs / Citizen & Resident Identity
  ('Citizen & Resident Identity', 'National ID Number',   'The 10-digit national identification number issued to a Saudi citizen.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Citizen & Resident Identity', 'Iqama Number',          'The 10-digit residence permit number issued to a non-Saudi resident.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Citizen & Resident Identity', 'Passport Number',       'The identifier on an individual''s passport, issued by the relevant national authority.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Citizen & Resident Identity', 'Family Card Number',    'The household civil registry number linking a family''s members under one record.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Citizen & Resident Identity', 'Date of Birth',         'The individual''s date of birth, Gregorian or Hijri.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Citizen & Resident Identity', 'Place of Birth',        'The city/country where the individual was born.', 'INTERNAL', true, 'PERSONAL'),
  ('Citizen & Resident Identity', 'Nationality',           'The individual''s country of citizenship.', 'INTERNAL', true, 'PERSONAL'),
  ('Citizen & Resident Identity', 'Gender',                'The individual''s recorded gender.', 'INTERNAL', true, 'PERSONAL'),
  ('Citizen & Resident Identity', 'Marital Status',        'The individual''s recorded marital status.', 'INTERNAL', true, 'PERSONAL'),
  ('Citizen & Resident Identity', 'Biometric Identification Data', 'Fingerprint and facial-recognition data used to uniquely identify an individual.', 'SECRET', true, 'BIOMETRIC'),
  -- Identity & Civil Affairs / National Address
  ('National Address', 'National Address Short Code', 'The 8-character Saudi National Address code (4 letters + 4 digits) identifying a specific address.', 'RESTRICTED', true, 'CONTACT'),
  ('National Address', 'Building Number',              'The 4-digit building identifier within a National Address.', 'INTERNAL', true, 'CONTACT'),
  ('National Address', 'Postal Code',                  'The 5-digit postal code of an address.', 'PUBLIC', false, NULL),
  ('National Address', 'District Name',                'The neighborhood/district name of an address.', 'PUBLIC', false, NULL),
  -- Citizen & Government Services / Digital Identity & Authentication
  ('Digital Identity & Authentication', 'Digital Identity Credential', 'A national digital-identity credential (e.g. Nafath) used to authenticate to government e-services.', 'SECRET', true, 'DIRECT_ID'),
  ('Digital Identity & Authentication', 'Mobile Number',               'The individual''s registered mobile number, used for e-service authentication (e.g. Absher).', 'RESTRICTED', true, 'CONTACT'),
  ('Digital Identity & Authentication', 'Government Correspondence Email', 'The email address used for official correspondence with a government entity.', 'PUBLIC', true, 'CONTACT'),
  ('Digital Identity & Authentication', 'System/API Credential',       'A secret token or key used to authenticate a system integration to a government e-service API.', 'SECRET', false, NULL),
  -- Citizen & Government Services / Service Requests & Transactions
  ('Service Requests & Transactions', 'Service Request Number',      'A reference number for a citizen/resident''s government service request.', 'INTERNAL', false, NULL),
  ('Service Requests & Transactions', 'Government Transaction Reference', 'A reference number for a completed government e-service transaction.', 'INTERNAL', false, NULL),
  ('Service Requests & Transactions', 'Service Fee Amount',          'The fee charged for a government service.', 'INTERNAL', false, NULL),
  -- Public Health & Social Welfare / Patient & Health Records
  ('Patient & Health Records', 'Patient Medical Record', 'The clinical record of an individual''s diagnoses, treatments, and health history.', 'SECRET', true, 'HEALTH'),
  ('Patient & Health Records', 'Prescription Record',    'A record of medication prescribed to an individual.', 'SECRET', true, 'HEALTH'),
  ('Patient & Health Records', 'Vaccination Record',     'A record of vaccinations administered to an individual.', 'CONFIDENTIAL', true, 'HEALTH'),
  ('Patient & Health Records', 'Health Insurance Number', 'The individual''s health insurance policy/member number.', 'RESTRICTED', true, 'HEALTH'),
  -- Public Health & Social Welfare / Social Welfare & Benefits
  ('Social Welfare & Benefits', 'Citizen Account Beneficiary ID', 'The identifier for a beneficiary enrolled in the Citizen Account social-support program.', 'RESTRICTED', true, 'FINANCIAL'),
  ('Social Welfare & Benefits', 'Disability Support Registration', 'A registration record for disability support services.', 'CONFIDENTIAL', true, 'PERSONAL'),
  -- Education / Student Records
  ('Student Records', 'Student ID (Noor)',           'The student identifier issued by the Ministry of Education''s Noor system.', 'INTERNAL', true, 'DIRECT_ID'),
  ('Student Records', 'Academic Record',              'A student''s grades, GPA, and academic transcript.', 'CONFIDENTIAL', true, 'PERSONAL'),
  ('Student Records', 'University Registration Number', 'A student''s registration number at a higher-education institution.', 'INTERNAL', true, 'DIRECT_ID'),
  -- Education / Scholarships & Higher Education
  ('Scholarships & Higher Education', 'Scholarship Beneficiary ID', 'The identifier for a recipient of a government-funded scholarship.', 'CONFIDENTIAL', true, 'FINANCIAL'),
  -- Justice & Legal Affairs / Judicial Records
  ('Judicial Records', 'Court Case Number',      'A judicial case reference number.', 'CONFIDENTIAL', true, 'PERSONAL'),
  ('Judicial Records', 'Legal Contract Number',  'A reference number for a registered legal contract.', 'INTERNAL', false, NULL),
  ('Judicial Records', 'Power of Attorney Number', 'A reference number for a registered power-of-attorney instrument.', 'CONFIDENTIAL', true, 'PERSONAL'),
  -- Transportation & Traffic / Vehicle & Licensing
  ('Vehicle & Licensing', 'Vehicle Registration Number', 'The vehicle registration (Istimara) reference number.', 'INTERNAL', true, 'DIRECT_ID'),
  ('Vehicle & Licensing', 'Vehicle Plate Number',        'The license plate number of a registered vehicle.', 'PUBLIC', true, 'DIRECT_ID'),
  ('Vehicle & Licensing', 'Driving License Number',      'A driver''s license identification number.', 'RESTRICTED', true, 'DIRECT_ID'),
  ('Vehicle & Licensing', 'Traffic Violation Number',    'A traffic violation citation reference number.', 'INTERNAL', true, 'PERSONAL'),
  -- Finance / Government Revenue & Taxation
  ('Government Revenue & Taxation', 'VAT Registration Number',        'A taxable entity''s ZATCA VAT registration number.', 'INTERNAL', false, NULL),
  ('Government Revenue & Taxation', 'Commercial Registration Number', 'A business entity''s Ministry of Commerce registration number.', 'INTERNAL', false, NULL),
  ('Government Revenue & Taxation', 'Zakat Registration Number',      'A Zakat-paying entity''s ZATCA registration identifier.', 'RESTRICTED', false, NULL),
  ('Government Revenue & Taxation', 'Government Payment IBAN',        'The bank IBAN used for a government disbursement or payment.', 'RESTRICTED', false, 'FINANCIAL'),
  ('Government Revenue & Taxation', 'Government Payment Card Number', 'The payment card number used for a government transaction.', 'RESTRICTED', false, 'FINANCIAL'),
  -- HR & Workforce / Civil Service Employment
  ('Civil Service Employment', 'Civil Service Employee Number', 'A government employee''s civil-service personnel number.', 'INTERNAL', true, 'DIRECT_ID'),
  ('Civil Service Employment', 'Government Employee Salary',    'A government employee''s base salary and benefits.', 'RESTRICTED', true, 'FINANCIAL'),
  ('Civil Service Employment', 'GOSI Subscription Number',      'The employee''s subscription number with the General Organization for Social Insurance.', 'RESTRICTED', true, 'DIRECT_ID')
) AS t(subdomain, name, def, classification, is_pii, pi_category)
JOIN bayanat.business_glossaries sd ON sd.term_name_text = t.subdomain AND sd.term_type = 'SUBDOMAIN'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.business_glossaries g WHERE g.term_name_text = t.name AND g.parent_glossary_id = sd.glossary_id
);

-- ── 5. Associate the relevant terms with their SIT type ────────────────────────
-- Only the terms that represent a genuinely detectable Sensitive Information
-- Type get an association — most terms above (Place of Birth, Academic Record,
-- Service Request Number, ...) intentionally get none.

INSERT INTO bayanat.business_term_sit_types (glossary_id, sit_type_id)
SELECT g.glossary_id, st.sit_type_id
FROM (VALUES
  ('National ID Number',              'National ID'),
  ('Iqama Number',                    'Iqama Number'),
  ('Passport Number',                 'Passport Number'),
  ('Family Card Number',              'Family Card Number'),
  ('Date of Birth',                   'DoB'),
  ('Biometric Identification Data',   'Fingerprints'),
  ('Biometric Identification Data',   'Facial Print'),
  ('National Address Short Code',     'National Address Code'),
  ('Building Number',                 'Building Number'),
  ('Postal Code',                     'Postal Code (KSA)'),
  ('Digital Identity Credential',     'Digital Identity Credential'),
  ('Mobile Number',                   'Phone Number'),
  ('Government Correspondence Email', 'Email Address'),
  ('System/API Credential',           'API Key / Credential Secret'),
  ('Patient Medical Record',          'Health Records'),
  ('Prescription Record',             'Prescriptions'),
  ('Health Insurance Number',         'Health Insurance Number'),
  ('Citizen Account Beneficiary ID',  'Social Welfare Beneficiary ID'),
  ('Student ID (Noor)',               'Student ID (Noor)'),
  ('Court Case Number',               'Court Case Number'),
  ('Vehicle Registration Number',     'Vehicle Registration Number'),
  ('Vehicle Plate Number',            'Vehicle Plate Number'),
  ('Driving License Number',          'Driving License Number'),
  ('Traffic Violation Number',        'Traffic Violation Number'),
  ('VAT Registration Number',         'VAT Number'),
  ('Commercial Registration Number',  'Commercial Registration Number'),
  ('Zakat Registration Number',       'Zakat Registration Number'),
  ('Government Payment IBAN',         'Bank Account Number'),
  ('Government Payment Card Number',  'Credit Card Details'),
  ('Civil Service Employee Number',   'Civil Service Employee Number'),
  ('Government Employee Salary',      'Employees Salaries and Benefits'),
  ('GOSI Subscription Number',        'GOSI Number')
) AS assoc(term_name, sit_name)
JOIN bayanat.sit_types st ON st.sit_name = assoc.sit_name
JOIN bayanat.business_glossaries g ON g.term_name_text = assoc.term_name AND g.term_type = 'TERM'
  AND g.parent_glossary_id IN (
    SELECT glossary_id FROM bayanat.business_glossaries WHERE term_type = 'SUBDOMAIN'
    AND term_name_text IN ('Citizen & Resident Identity','National Address','Digital Identity & Authentication',
      'Patient & Health Records','Social Welfare & Benefits','Student Records','Vehicle & Licensing',
      'Government Revenue & Taxation','Civil Service Employment')
  )
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.business_term_sit_types bts WHERE bts.glossary_id = g.glossary_id AND bts.sit_type_id = st.sit_type_id
);
