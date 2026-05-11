-- ── Fix: add cert_dimension to asset_certifications ──────────────────────────
ALTER TABLE bayanat.asset_certifications
  ADD COLUMN IF NOT EXISTS cert_dimension VARCHAR(20) DEFAULT 'METADATA';

-- Back-fill existing rows so legacy cert appears under METADATA dimension
UPDATE bayanat.asset_certifications
SET cert_dimension = 'METADATA'
WHERE cert_dimension IS NULL;

-- ── Seed: CRM Database source + crm schema + entities + attributes ────────────
DO $$
DECLARE
  v_src  INT;
  v_sch  INT;
  e1 INT; e2 INT; e3 INT; e4 INT; e5 INT;
  e6 INT; e7 INT; e8 INT; e9 INT; e10 INT;
BEGIN
  -- Skip if CRM source already catalogued
  IF EXISTS (SELECT 1 FROM bayanat.data_sources WHERE source_name_text = 'CRM Database') THEN
    RAISE NOTICE 'CRM Database already present – skipping seed.';
    RETURN;
  END IF;

  -- ── Data source ──────────────────────────────────────────────────────────────
  INSERT INTO bayanat.data_sources
    (source_name_text, source_type_code, host_address_text, database_name_text, description_text, business_app_name)
  VALUES
    ('CRM Database', 'POSTGRES', 'localhost', 'bayanatix',
     'Customer Relationship Management – Party model, accounts, interactions, opportunities, orders and campaigns.',
     'Bayanatix CRM')
  RETURNING data_source_id INTO v_src;

  -- ── Schema ───────────────────────────────────────────────────────────────────
  INSERT INTO bayanat.data_schemas (data_source_id, schema_name_text, description_text, owner_user_id)
  VALUES (v_src, 'crm',
    'CRM party model: customers, organisations, contacts, roles, opportunities, interactions, service cases, orders, campaigns.',
    'sara.alqahtani')
  RETURNING schema_id INTO v_sch;

  -- ── Entities (tables) ────────────────────────────────────────────────────────
  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'party', 'Party', 'MASTER', 'Root entity for every person or organisation in the CRM.', 20000, 88.0, false)
  RETURNING entity_id INTO e1;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'person', 'Person', 'MASTER', 'Natural-person attributes linked to a Party record.', 14000, 84.0, false)
  RETURNING entity_id INTO e2;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'organization', 'Organisation', 'MASTER', 'Legal-entity attributes linked to a Party record.', 6000, 86.0, false)
  RETURNING entity_id INTO e3;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'customer_account', 'Customer Account', 'MASTER', 'CRM account with tier, credit limit and KYC tracking per party.', 18000, 91.0, false)
  RETURNING entity_id INTO e4;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'opportunity', 'Opportunity', 'TRANSACTIONAL', 'Sales pipeline opportunity with stage, probability and estimated value.', 8500, 79.0, false)
  RETURNING entity_id INTO e5;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'interaction', 'Interaction', 'TRANSACTIONAL', 'Customer interaction log: calls, emails, meetings, chats.', 142000, 72.0, false)
  RETURNING entity_id INTO e6;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'service_case', 'Service Case', 'TRANSACTIONAL', 'Customer service tickets: complaints, inquiries, requests.', 31000, 83.0, false)
  RETURNING entity_id INTO e7;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'sales_order', 'Sales Order', 'TRANSACTIONAL', 'Sales orders with status, totals, and payment tracking.', 24000, 87.0, false)
  RETURNING entity_id INTO e8;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'product', 'Product', 'REFERENCE', 'Product catalogue with pricing, type and category.', 1200, 94.0, false)
  RETURNING entity_id INTO e9;

  INSERT INTO bayanat.data_entities (schema_id, entity_name_text, display_name_text, entity_category_code, description_text, row_count_estimate, trust_score, is_view_indicator)
  VALUES (v_sch, 'campaign', 'Campaign', 'REFERENCE', 'Marketing campaigns with budget, spend, leads and conversions.', 450, 90.0, false)
  RETURNING entity_id INTO e10;

  -- ── Attributes: party ─────────────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e1, 'party_id',      'Party ID',       'integer',      true,  false, 'PUBLIC',     'Surrogate primary key.'),
    (e1, 'party_type',    'Party Type',     'varchar(20)',  false, false, 'PUBLIC',     'PERSON or ORGANISATION.'),
    (e1, 'is_active',     'Active',         'boolean',      false, false, 'PUBLIC',     'Whether the party is currently active.'),
    (e1, 'external_ref',  'External Ref',   'varchar(100)', false, true,  'RESTRICTED', 'Reference ID from source system.'),
    (e1, 'source_system', 'Source System',  'varchar(50)',  false, true,  'PUBLIC',     'Originating system (MANUAL, CRM, ERP…).'),
    (e1, 'created_at',    'Created At',     'timestamp',    false, false, 'PUBLIC',     'Record creation timestamp.'),
    (e1, 'updated_at',    'Updated At',     'timestamp',    false, false, 'PUBLIC',     'Last update timestamp.');

  -- ── Attributes: person ────────────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e2, 'party_id',         'Party ID',       'integer',      true,  false, 'PUBLIC',     'FK to party – shares PK.'),
    (e2, 'first_name',       'First Name',     'varchar(100)', false, false, 'PII',        'Given name.'),
    (e2, 'last_name',        'Last Name',      'varchar(100)', false, false, 'PII',        'Family name.'),
    (e2, 'date_of_birth',    'Date of Birth',  'date',         false, true,  'SENSITIVE',  'Date of birth – PII/PDPL sensitive.'),
    (e2, 'gender_code',      'Gender',         'varchar(10)',  false, true,  'SENSITIVE',  'M / F / OTHER / UNKNOWN.'),
    (e2, 'national_id',      'National ID',    'varchar(50)',  false, true,  'PII',        'Saudi National ID number.'),
    (e2, 'passport_no',      'Passport No.',   'varchar(50)',  false, true,  'PII',        'Passport number.');

  -- ── Attributes: organization ──────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e3, 'party_id',        'Party ID',        'integer',      true,  false, 'PUBLIC',     'FK to party – shares PK.'),
    (e3, 'org_name',        'Organisation',    'varchar(255)', false, false, 'PUBLIC',     'Legal organisation name.'),
    (e3, 'trade_name',      'Trade Name',      'varchar(255)', false, true,  'PUBLIC',     'DBA / trade name.'),
    (e3, 'registration_no', 'Registration No', 'varchar(100)', false, true,  'RESTRICTED', 'Commercial registration number.'),
    (e3, 'tax_id',          'Tax ID',          'varchar(100)', false, true,  'RESTRICTED', 'Tax registration number.'),
    (e3, 'industry_code',   'Industry Code',   'varchar(50)',  false, true,  'PUBLIC',     'Industry classification code.'),
    (e3, 'org_size_code',   'Org Size',        'varchar(20)',  false, true,  'PUBLIC',     'MICRO/SMALL/MEDIUM/LARGE/ENTERPRISE.');

  -- ── Attributes: customer_account ─────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e4, 'account_id',       'Account ID',      'integer',       true,  false, 'PUBLIC',     'Surrogate PK.'),
    (e4, 'party_id',         'Party ID',        'integer',       false, false, 'PUBLIC',     'FK to party.'),
    (e4, 'account_no',       'Account No.',     'varchar(50)',   false, false, 'RESTRICTED', 'Unique business account number.'),
    (e4, 'account_type',     'Account Type',    'varchar(30)',   false, true,  'PUBLIC',     'INDIVIDUAL / CORPORATE / VIP / GOVERNMENT.'),
    (e4, 'tier_code',        'Tier',            'varchar(20)',   false, true,  'PUBLIC',     'BRONZE / SILVER / GOLD / PLATINUM / DIAMOND.'),
    (e4, 'kyc_status',       'KYC Status',      'varchar(20)',   false, true,  'RESTRICTED', 'Know-Your-Customer verification status.'),
    (e4, 'credit_limit',     'Credit Limit',    'numeric(18,2)', false, true,  'RESTRICTED', 'Approved credit limit.');

  -- ── Attributes: opportunity ───────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e5, 'opportunity_id',   'Opportunity ID',  'integer',       true,  false, 'PUBLIC',     'Surrogate PK.'),
    (e5, 'opportunity_ref',  'Ref',             'varchar(50)',   false, false, 'PUBLIC',     'Business reference number.'),
    (e5, 'party_id',         'Party ID',        'integer',       false, false, 'PUBLIC',     'FK to party (prospect/customer).'),
    (e5, 'stage_code',       'Stage',           'varchar(30)',   false, false, 'PUBLIC',     'Pipeline stage: PROSPECT → CLOSED_WON / CLOSED_LOST.'),
    (e5, 'probability_pct',  'Probability %',   'numeric(5,2)',  false, true,  'PUBLIC',     'Win probability 0-100.'),
    (e5, 'est_value',        'Estimated Value', 'numeric(15,2)', false, true,  'RESTRICTED', 'Estimated deal value.'),
    (e5, 'close_date_est',   'Est. Close',      'date',          false, true,  'PUBLIC',     'Estimated closing date.');

  -- ── Attributes: interaction ───────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e6, 'interaction_id',   'Interaction ID',  'integer',      true,  false, 'PUBLIC',     'Surrogate PK.'),
    (e6, 'party_id',         'Party ID',        'integer',      false, false, 'PUBLIC',     'FK to party.'),
    (e6, 'channel_code',     'Channel',         'varchar(30)',  false, false, 'PUBLIC',     'EMAIL / CALL / MEETING / CHAT / SMS / SOCIAL / IN_PERSON.'),
    (e6, 'direction_code',   'Direction',       'varchar(10)',  false, true,  'PUBLIC',     'INBOUND / OUTBOUND / INTERNAL.'),
    (e6, 'occurred_at',      'Occurred At',     'timestamp',    false, false, 'PUBLIC',     'When the interaction happened.'),
    (e6, 'sentiment_score',  'Sentiment',       'numeric(3,2)', false, true,  'PUBLIC',     'NLP sentiment score -1 to +1.');

  -- ── Attributes: service_case ──────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e7, 'case_id',          'Case ID',         'integer',      true,  false, 'PUBLIC',     'Surrogate PK.'),
    (e7, 'case_ref',         'Case Ref',        'varchar(50)',  false, false, 'PUBLIC',     'Unique business case number.'),
    (e7, 'party_id',         'Party ID',        'integer',      false, false, 'PUBLIC',     'FK to party.'),
    (e7, 'case_type',        'Type',            'varchar(50)',  false, true,  'PUBLIC',     'COMPLAINT / INQUIRY / REQUEST / FEEDBACK / ESCALATION.'),
    (e7, 'priority_code',    'Priority',        'varchar(10)',  false, true,  'PUBLIC',     'LOW / MEDIUM / HIGH / CRITICAL.'),
    (e7, 'status_code',      'Status',          'varchar(20)',  false, false, 'PUBLIC',     'OPEN / IN_PROGRESS / PENDING / RESOLVED / CLOSED.'),
    (e7, 'opened_at',        'Opened At',       'timestamp',    false, false, 'PUBLIC',     'Case opening timestamp.');

  -- ── Attributes: sales_order ───────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e8, 'order_id',         'Order ID',        'integer',       true,  false, 'PUBLIC',     'Surrogate PK.'),
    (e8, 'order_ref',        'Order Ref',       'varchar(50)',   false, false, 'PUBLIC',     'Unique business order number.'),
    (e8, 'party_id',         'Party ID',        'integer',       false, false, 'PUBLIC',     'FK to party (buyer).'),
    (e8, 'order_status',     'Status',          'varchar(20)',   false, false, 'PUBLIC',     'DRAFT / CONFIRMED / PROCESSING / SHIPPED / DELIVERED / CANCELLED / REFUNDED.'),
    (e8, 'total_amount',     'Total',           'numeric(15,2)', false, true,  'RESTRICTED', 'Order total including tax.'),
    (e8, 'currency_code',    'Currency',        'char(3)',        false, true,  'PUBLIC',     'ISO-4217 currency (default AED).'),
    (e8, 'order_date',       'Order Date',      'date',           false, false, 'PUBLIC',     'Date order was placed.');

  -- ── Attributes: product ───────────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e9, 'product_id',   'Product ID',    'integer',      true,  false, 'PUBLIC', 'Surrogate PK.'),
    (e9, 'product_code', 'Code',          'varchar(50)',  false, false, 'PUBLIC', 'Unique SKU code.'),
    (e9, 'product_name', 'Name',          'varchar(255)', false, false, 'PUBLIC', 'Product display name.'),
    (e9, 'product_type', 'Type',          'varchar(50)',  false, true,  'PUBLIC', 'GOODS / SERVICE / SUBSCRIPTION / BUNDLE.'),
    (e9, 'category',     'Category',      'varchar(100)', false, true,  'PUBLIC', 'Product category.'),
    (e9, 'unit_price',   'Unit Price',    'numeric(15,2)',false, true,  'PUBLIC', 'List price per unit.');

  -- ── Attributes: campaign ──────────────────────────────────────────────────────
  INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text, is_primary_key_indicator, is_nullable_indicator, classification_code, description_text)
  VALUES
    (e10, 'campaign_id',   'Campaign ID',   'integer',      true,  false, 'PUBLIC', 'Surrogate PK.'),
    (e10, 'campaign_code', 'Code',          'varchar(50)',  false, false, 'PUBLIC', 'Unique campaign code.'),
    (e10, 'campaign_name', 'Name',          'varchar(255)', false, false, 'PUBLIC', 'Campaign display name.'),
    (e10, 'campaign_type', 'Type',          'varchar(50)',  false, true,  'PUBLIC', 'EMAIL / SMS / SOCIAL / EVENT / WEBINAR / DIRECT_MAIL / DIGITAL.'),
    (e10, 'status_code',   'Status',        'varchar(20)',  false, false, 'PUBLIC', 'DRAFT / ACTIVE / PAUSED / COMPLETED / CANCELLED.'),
    (e10, 'budget',        'Budget',        'numeric(15,2)',false, true,  'PUBLIC', 'Planned campaign budget.'),
    (e10, 'conversions',   'Conversions',   'integer',      false, true,  'PUBLIC', 'Number of successful conversions.');

  -- ── Sequence corrections ──────────────────────────────────────────────────────
  PERFORM setval(
    pg_get_serial_sequence('bayanat.data_sources','data_source_id'),
    (SELECT MAX(data_source_id) FROM bayanat.data_sources)
  );
  PERFORM setval(
    pg_get_serial_sequence('bayanat.data_schemas','schema_id'),
    (SELECT MAX(schema_id) FROM bayanat.data_schemas)
  );
  PERFORM setval(
    pg_get_serial_sequence('bayanat.data_entities','entity_id'),
    (SELECT MAX(entity_id) FROM bayanat.data_entities)
  );
  PERFORM setval(
    pg_get_serial_sequence('bayanat.data_attributes','attribute_id'),
    (SELECT MAX(attribute_id) FROM bayanat.data_attributes)
  );

  RAISE NOTICE 'CRM seed complete: source=%, schema=%, 10 entities.', v_src, v_sch;
END $$;
