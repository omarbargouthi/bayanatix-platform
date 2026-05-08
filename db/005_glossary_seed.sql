-- ─────────────────────────────────────────────────────────────────────────────
-- 005_glossary_seed.sql
-- Enriches business_glossaries with real Finance-domain terms, populates
-- classification / PI-category lookup tables, and adds glossary aliases.
-- Edit the INSERT rows to change term definitions shown in the UI.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Lookup tables ─────────────────────────────────────────────────────────────
INSERT INTO bayanat.classification_types (class_code, class_name_text) VALUES
    ('PUBLIC',       'Public'),
    ('INTERNAL',     'Internal'),
    ('CONFIDENTIAL', 'Confidential'),
    ('RESTRICTED',   'Restricted'),
    ('SECRET',       'Secret')
ON CONFLICT (class_code) DO NOTHING;

INSERT INTO bayanat.pi_category_types (category_code, category_name_text) VALUES
    ('DIRECT_ID',  'Direct Identifier'),
    ('CONTACT',    'Contact Information'),
    ('FINANCIAL',  'Financial Data'),
    ('BIOMETRIC',  'Biometric Data')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO bayanat.npi_category_types (category_code, category_name_text) VALUES
    ('OPERATIONAL', 'Operational Data'),
    ('REFERENCE',   'Reference Data'),
    ('ANALYTICAL',  'Analytical Data')
ON CONFLICT (category_code) DO NOTHING;

-- ── Enrich existing domain-level terms ───────────────────────────────────────
UPDATE bayanat.business_glossaries SET
    definition_text = 'Covers all financial instruments, transactions, and reporting concepts — accounts receivable, invoicing, and payment processing.',
    classification_code = 'INTERNAL'
WHERE glossary_id = 1;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Human resources, workforce planning, headcount, compensation, and employee lifecycle management.',
    classification_code = 'CONFIDENTIAL'
WHERE glossary_id = 2;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Customer 360 profiles, marketing channels, segmentation, campaign metrics, and customer lifetime value.',
    classification_code = 'INTERNAL'
WHERE glossary_id = 3;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Data classification levels, PDPL obligations, data subject rights, and regulatory compliance controls.',
    classification_code = 'RESTRICTED'
WHERE glossary_id = 4;

UPDATE bayanat.business_glossaries SET
    definition_text = 'Standardised KSA government reference codes — regions, cities, currencies, industry classifications (ISIC), and public-sector identifiers.',
    classification_code = 'PUBLIC'
WHERE glossary_id = 5;

-- ── Finance domain terms (parent_glossary_id = 1) ────────────────────────────
INSERT INTO bayanat.business_glossaries
    (parent_glossary_id, term_name_text, definition_text, business_rules_text,
     format_text, example_text, classification_code, is_pii_indicator, pi_category_code)
VALUES
    (1, 'Invoice',
     'A commercial document issued by a seller to a buyer specifying products, quantities, and agreed-upon prices for goods or services rendered.',
     'Must carry a unique invoice number. Lifecycle must follow DRAFT → OPEN → PAID or CANCELLED. Due date must not precede invoice date. VAT line is mandatory for taxable supplies.',
     'INV-YYYY-NNNNNN — e.g. INV-2025-000123',
     'INV-2025-000123 issued to Al-Rashidi Trading Co. for SAR 45,200 with NET30 payment terms.',
     'INTERNAL', false, NULL),

    (1, 'Customer',
     'An individual, company, or organisation that purchases goods or services. Represented as a unique record in the customer master.',
     'Must have a valid National ID or commercial registration number. Duplicate records must be merged. Customer status must be ACTIVE, INACTIVE, or SUSPENDED.',
     'C-NNNNN (5-digit numeric sequence)',
     'C-00089 "Al-Rashidi Trading Co." — ACTIVE, National ID 1234567890.',
     'INTERNAL', false, NULL),

    (1, 'Invoice Total',
     'The gross monetary amount payable, calculated as the sum of line-item amounts plus applicable taxes and surcharges, less any approved discounts.',
     'Must equal sum of line items plus VAT Amount. Must be expressed in the invoice currency. Cannot be negative except for credit notes.',
     'Decimal(18,2) in invoice currency',
     '45,200.00 SAR (SAR 40,000 base + SAR 5,200 VAT at 15%).',
     'CONFIDENTIAL', false, 'FINANCIAL'),

    (1, 'VAT Amount',
     'The Value Added Tax component applied to the invoice, computed at the current statutory rate on the taxable base.',
     'KSA VAT rate: 15% effective January 2021. Must be computed on taxable line items only. Zero-rated items must be identified with reason code. Must appear on the ZATCA-compliant e-invoice XML.',
     'Decimal(18,2) in invoice currency',
     'SAR 5,200 VAT on a SAR 34,666.67 taxable base at 15%.',
     'CONFIDENTIAL', false, 'FINANCIAL'),

    (1, 'Payment Terms',
     'The contractually agreed conditions specifying when payment is due and any early-settlement discount incentives.',
     'Valid codes: NET30, NET60, NET90, IMMEDIATE, COD. Must be agreed and recorded before invoice issuance. Early-payment discounts require written Finance approval.',
     'Code: NET{days} | IMMEDIATE | COD',
     'NET30 — payment due within 30 calendar days of invoice date.',
     'INTERNAL', false, NULL),

    (1, 'Due Date',
     'The date by which full invoice payment must be received, derived from invoice date and the agreed payment terms.',
     'Due Date = Invoice Date + payment-terms days. Cannot precede Invoice Date. For IMMEDIATE terms equals Invoice Date. System auto-flags OVERDUE when Due Date passes without settlement.',
     'ISO 8601 — YYYY-MM-DD',
     '2025-08-15 (Invoice Date 2025-07-16 + NET30).',
     'INTERNAL', false, NULL),

    (1, 'Invoice Date',
     'The date the invoice was formally issued, marking the start of the payment obligation period and determining the fiscal recognition period.',
     'Must not be a future date. Determines the fiscal quarter for revenue recognition. Backdating beyond 30 days requires Finance Controller approval.',
     'ISO 8601 — YYYY-MM-DD',
     '2025-07-16',
     'INTERNAL', false, NULL),

    (1, 'Invoice Status',
     'The current lifecycle state of an invoice, indicating progress from draft through settlement or cancellation.',
     'Valid values: DRAFT, OPEN, PAID, OVERDUE, CANCELLED. Transitions must follow the defined state machine. OVERDUE is set automatically by nightly batch when Due Date passes. Only Finance may set CANCELLED.',
     'Enum: DRAFT | OPEN | PAID | OVERDUE | CANCELLED',
     'OPEN — invoice issued and awaiting customer payment.',
     'INTERNAL', false, NULL),

    (1, 'Currency',
     'The ISO 4217 three-letter code identifying the monetary unit in which invoice amounts are denominated.',
     'Default is SAR. Multi-currency invoices must record the original amount and the SAR equivalent using SAMA daily exchange rates. Exchange-rate source must be stored with the record.',
     'ISO 4217 — three uppercase letters',
     'SAR — Saudi Arabian Riyal.',
     'INTERNAL', false, NULL),

    (1, 'National ID',
     'The unique 10-digit national identification number issued by the Saudi government to citizens and registered residents (Iqama).',
     'Exactly 10 digits. Citizens start with 1; residents start with 2. Must be validated against ABSHER/Yaqeen service at point of capture. Must be masked in non-production environments.',
     'Numeric string — NNNNNNNNNN (10 digits)',
     '1234567890 (Saudi citizen), 2098765432 (resident).',
     'RESTRICTED', true, 'DIRECT_ID'),

    (1, 'Customer Email',
     'The primary electronic mail address recorded for a customer, used for invoice delivery, notifications, and correspondence.',
     'Must conform to RFC 5322 syntax. Requires explicit customer consent under PDPL before storage. Must be masked in reports unless user has PII access role.',
     'local-part@domain — RFC 5322 compliant',
     'finance@alrashidi-trading.com.sa',
     'RESTRICTED', true, 'CONTACT');

-- ── Customer & Marketing domain terms (parent_glossary_id = 3) ───────────────
INSERT INTO bayanat.business_glossaries
    (parent_glossary_id, term_name_text, definition_text, business_rules_text,
     format_text, example_text, classification_code, is_pii_indicator, pi_category_code)
VALUES
    (3, 'Customer Segment',
     'A grouping of customers sharing similar characteristics such as industry, revenue band, geographic region, or purchasing behaviour, used to tailor engagement strategies.',
     'Segmentation model must be reviewed annually. Segments must be mutually exclusive and collectively exhaustive. Assignment must be recalculated quarterly.',
     'Code: SEG-{code} — e.g. SEG-ENT (Enterprise), SEG-SME, SEG-GOV',
     'SEG-GOV — Government & Public Sector accounts.',
     'INTERNAL', false, NULL),

    (3, 'Customer Lifetime Value',
     'The total net revenue expected from a customer relationship over its projected duration, used to prioritise retention and growth investments.',
     'Calculated as: average annual revenue × expected relationship years × gross margin. Must be recalculated at least annually. Negative CLV customers require account-manager review.',
     'Decimal(18,2) in SAR',
     'SAR 2,400,000 CLV for a government account with 8-year expected tenure.',
     'CONFIDENTIAL', false, 'FINANCIAL');

-- ── Glossary aliases ──────────────────────────────────────────────────────────
INSERT INTO bayanat.glossary_aliases (glossary_id, alias_name_text)
SELECT g.glossary_id, a.alias
FROM bayanat.business_glossaries g
JOIN (VALUES
    ('Invoice',                 'Tax Invoice'),
    ('Invoice',                 'Sales Invoice'),
    ('Invoice',                 'Bill'),
    ('Customer',                'Client'),
    ('Customer',                'Account'),
    ('Customer',                'Debtor'),
    ('Invoice Total',           'Grand Total'),
    ('Invoice Total',           'Total Due'),
    ('Invoice Total',           'Amount Payable'),
    ('VAT Amount',              'Tax Amount'),
    ('VAT Amount',              'GST'),
    ('VAT Amount',              'ZATCA Tax'),
    ('Payment Terms',           'Credit Terms'),
    ('Payment Terms',           'Settlement Terms'),
    ('National ID',             'Iqama Number'),
    ('National ID',             'ID Number'),
    ('National ID',             'Civil ID'),
    ('Customer Email',          'Email Address'),
    ('Customer Email',          'Contact Email'),
    ('Customer Lifetime Value', 'CLV'),
    ('Customer Lifetime Value', 'LTV')
) AS a(term, alias) ON g.term_name_text = a.term;

-- ── Attribute classification backfill ────────────────────────────────────────
UPDATE bayanat.data_attributes SET classification_code = 'RESTRICTED'
WHERE physical_name_text IN ('customer_national_id', 'customer_email');

UPDATE bayanat.data_attributes SET classification_code = 'CONFIDENTIAL'
WHERE physical_name_text IN ('total_amount', 'tax_amount');

UPDATE bayanat.data_attributes SET classification_code = 'INTERNAL'
WHERE physical_name_text IN ('invoice_id','invoice_number','invoice_date',
                              'due_date','status_code','payment_terms_code',
                              'currency_code','customer_id','last_modified_user',
                              'created_at_timestamp')
  AND classification_code IS NULL;

UPDATE bayanat.data_attributes SET classification_code = 'PUBLIC'
WHERE classification_code IS NULL;
