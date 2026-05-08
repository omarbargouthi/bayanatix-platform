-- =====================================================
-- Demo seed data — safe to re-run (uses on conflict).
-- =====================================================

-- ---------- Users (3 sample roles) ----------
-- Demo password for all seeded users: Bayanatix123!
-- Hash generated with bcryptjs cost=12.
insert into bayanat.users (user_id, email, full_name, role, password_hash) values
  ('khaled.almansour', 'khaled@bayanatix.demo',  'Khaled Al-Mansour', 'STEWARD', '$2b$12$2xFDrJJgv4EMdHeeUCpVOOT0MBW2B2Z1/.r9Y2gbBSqY7H4Lzjn0K'),
  ('sara.alqahtani',   'sara@bayanatix.demo',    'Sara Al-Qahtani',   'ADMIN',   '$2b$12$2xFDrJJgv4EMdHeeUCpVOOT0MBW2B2Z1/.r9Y2gbBSqY7H4Lzjn0K'),
  ('mohammed.nasser',  'mohammed@bayanatix.demo','Mohammed Nasser',   'OFFICER', '$2b$12$2xFDrJJgv4EMdHeeUCpVOOT0MBW2B2Z1/.r9Y2gbBSqY7H4Lzjn0K'),
  ('fahad.harbi',      'fahad@bayanatix.demo',   'Fahad Al-Harbi',    'STEWARD', '$2b$12$2xFDrJJgv4EMdHeeUCpVOOT0MBW2B2Z1/.r9Y2gbBSqY7H4Lzjn0K')
on conflict (user_id) do nothing;

-- ---------- 14 NDMO governance domains ----------
insert into bayanat.governance_domains
  (domain_code, domain_name, domain_description, compliance_pct, maturity_level, maturity_label,
   specs_tracked, controls_passing, open_findings, alert_count, sort_order) values
  ('DG',   'Data Governance',           'Authority and control over data management.',                 78, 4, 'L3', 14, 12, 1, 2, 1),
  ('DCAT', 'Data Catalog',              'A single point of reference for all data assets.',            82, 4, 'L3', 18, 16, 1, 1, 2),
  ('DQ',   'Data Quality',              'Accuracy, completeness, consistency, validity.',              62, 3, 'L2', 22, 14, 6, 6, 3),
  ('DOPS', 'Data Operations',           'Manage the data lifecycle end to end.',                       71, 3, 'L2', 12,  9, 2, 3, 4),
  ('DCM',  'Content Management',        'Control unstructured documents and files.',                   58, 2, 'L2', 11,  6, 4, 4, 5),
  ('DARC', 'Data Architecture',         'Conceptual, logical, and physical models.',                   74, 4, 'L3', 13, 10, 1, 2, 6),
  ('MDM',  'Master Data',               'Manage core business entities.',                              70, 3, 'L3', 14, 10, 2, 2, 7),
  ('BIA',  'BI & Analytics',            'Derive insights from data.',                                  78, 4, 'L3', 12, 11, 0, 0, 8),
  ('DSH',  'Data Sharing',              'Enable secure data exchange.',                                78, 4, 'L3', 10,  9, 1, 1, 9),
  ('DV',   'Data Value',                'Maximize data''s business value.',                            78, 4, 'L3',  8,  7, 0, 0, 10),
  ('OD',   'Open Data',                 'Publish data for the public.',                                78, 4, 'L3',  9,  8, 1, 1, 11),
  ('FOI',  'FOI Requests',              'Ensure transparent access to information.',                   78, 4, 'L3',  7,  6, 1, 3, 12),
  ('CLS',  'Classification',            'Categorize data by sensitivity.',                             78, 4, 'L3', 14, 12, 0, 2, 13),
  ('PDP',  'Data Privacy (PDPL)',       'Safeguard individuals'' data rights.',                        78, 4, 'L3', 18, 17, 1, 0, 14),
  ('AIG',  'AI Governance',             'Govern AI models, data inputs and outputs.',                  76, 4, 'L3', 11,  9, 1, 1, 15)
on conflict (domain_code) do update set
  domain_name = excluded.domain_name,
  domain_description = excluded.domain_description,
  compliance_pct = excluded.compliance_pct,
  maturity_level = excluded.maturity_level,
  maturity_label = excluded.maturity_label,
  specs_tracked = excluded.specs_tracked,
  controls_passing = excluded.controls_passing,
  open_findings = excluded.open_findings,
  alert_count = excluded.alert_count,
  sort_order = excluded.sort_order;

-- ---------- Reference data (certifications) ----------
insert into bayanat.certification_types (cert_type_code, cert_type_name_text, description_text) values
  ('GOLD',   'Gold (Enterprise Certified)', 'Authoritative source verified by data stewards.'),
  ('SILVER', 'Silver (Trusted)',            'Reviewed and trusted; minor gaps allowed.'),
  ('BRONZE', 'Bronze (Provisional)',        'Documented but not fully reviewed.')
on conflict (cert_type_code) do nothing;

-- ---------- Sample data source ----------
insert into bayanat.data_sources (data_source_id, source_name_text, source_type_code, host_address_text, database_name_text, description_text) values
  (1, 'PostgreSQL Production', 'POSTGRES', 'pg-prod-01.internal', 'bayanat_prod', 'Primary OLTP database for finance and operations.'),
  (2, 'Snowflake DW',          'SNOWFLAKE','snowflake.internal',  'analytics',     'Analytics warehouse for reporting and BI.'),
  (3, 'Oracle EBS',            'ORACLE',   'oracle-ebs.internal', 'EBS',           'Legacy ERP, source for HR and Procurement.')
on conflict (data_source_id) do nothing;
select setval(pg_get_serial_sequence('bayanat.data_sources','data_source_id'),
              (select coalesce(max(data_source_id),1) from bayanat.data_sources));

-- ---------- Sample schema ----------
insert into bayanat.data_schemas (schema_id, data_source_id, schema_name_text, description_text, owner_user_id) values
  (1, 1, 'AR_SCHEMA',
     'Accounts Receivable schema containing customer invoices, payments, aging, and collections data for financial operations and reporting.',
     'sara.alqahtani'),
  (2, 1, 'AP_SCHEMA', 'Accounts Payable.',  'sara.alqahtani'),
  (3, 1, 'HR_SCHEMA', 'Human Resources.',   'sara.alqahtani')
on conflict (schema_id) do nothing;
select setval(pg_get_serial_sequence('bayanat.data_schemas','schema_id'),
              (select coalesce(max(schema_id),1) from bayanat.data_schemas));

-- ---------- Sample entities (tables) in AR_SCHEMA ----------
insert into bayanat.data_entities (entity_id, schema_id, entity_name_text, display_name_text, entity_category_code, description_text, is_view_indicator, row_count_estimate, trust_score) values
  (1, 1, 'AR_INVOICES',     'Customer Invoices',      'TRANSACTIONAL', 'Customer invoice records with header, line, tax, and payment terms.', false, 487210, 86.0),
  (2, 1, 'AR_CUSTOMERS',    'Customer Master',        'MASTER',        'Master customer records including legal name, billing address, credit limit.', false, 18402, 92.0),
  (3, 1, 'AR_PAYMENTS',     'Payments',               'TRANSACTIONAL', 'Payment receipts, references, and matching to invoice lines.', false, 312088, 74.0),
  (4, 1, 'AR_TRANSACTIONS', 'AR Transactions',        'TRANSACTIONAL', 'Granular accounting transactions for AR sub-ledger.', false, 982174, 81.0),
  (5, 1, 'AR_RECEIPTS',     'Cash Receipts',          'TRANSACTIONAL', 'Cash and electronic receipts with reconciliation status.', false, 144022, 88.0),
  (6, 1, 'AR_AGING',        'AR Aging Snapshot',      'REFERENCE',     'Aged receivables snapshot used for collections and DSO.', true,  18402, 69.0),
  (7, 1, 'AR_ADJUSTMENTS',  'Invoice Adjustments',    'TRANSACTIONAL', 'Credit memos, write-offs, and discount adjustments to invoices.', false, 28411, 61.0)
on conflict (entity_id) do nothing;
select setval(pg_get_serial_sequence('bayanat.data_entities','entity_id'),
              (select coalesce(max(entity_id),1) from bayanat.data_entities));

-- Stewards
insert into bayanat.stakeholder_roles (role_code, role_name_text, description_text) values
  ('OWNER','Owner','Accountable owner of the asset.'),
  ('BIZ_STEWARD','Business Steward','Definitions, quality and policies.'),
  ('TECH_STEWARD','Technical Steward','Technical metadata and lineage.')
on conflict (role_code) do nothing;

insert into bayanat.asset_stakeholders (asset_type_code, asset_id, user_id, role_code) values
  ('DATA_ENTITIES', 1, 'sara.alqahtani',  'OWNER'),
  ('DATA_ENTITIES', 1, 'mohammed.nasser', 'BIZ_STEWARD'),
  ('DATA_ENTITIES', 1, 'fahad.harbi',     'TECH_STEWARD'),
  ('DATA_ENTITIES', 2, 'sara.alqahtani',  'OWNER'),
  ('DATA_ENTITIES', 2, 'fahad.harbi',     'BIZ_STEWARD'),
  ('DATA_ENTITIES', 3, 'mohammed.nasser', 'OWNER'),
  ('DATA_ENTITIES', 3, 'fahad.harbi',     'BIZ_STEWARD'),
  ('DATA_ENTITIES', 4, 'sara.alqahtani',  'OWNER'),
  ('DATA_ENTITIES', 5, 'fahad.harbi',     'OWNER'),
  ('DATA_ENTITIES', 5, 'mohammed.nasser', 'BIZ_STEWARD'),
  ('DATA_ENTITIES', 6, 'sara.alqahtani',  'OWNER'),
  ('DATA_ENTITIES', 7, 'mohammed.nasser', 'OWNER')
on conflict do nothing;

-- Certifications
insert into bayanat.asset_certifications (asset_type_code, asset_id, cert_type_code, certified_by_user_id) values
  ('DATA_ENTITIES', 1, 'GOLD',   'sara.alqahtani'),
  ('DATA_ENTITIES', 2, 'GOLD',   'sara.alqahtani'),
  ('DATA_ENTITIES', 3, 'SILVER', 'sara.alqahtani'),
  ('DATA_ENTITIES', 4, 'SILVER', 'sara.alqahtani'),
  ('DATA_ENTITIES', 5, 'GOLD',   'sara.alqahtani'),
  ('DATA_ENTITIES', 6, 'SILVER', 'sara.alqahtani'),
  ('DATA_ENTITIES', 7, 'BRONZE', 'sara.alqahtani')
on conflict do nothing;

-- ---------- Sample attributes (columns) for AR_INVOICES ----------
insert into bayanat.data_attributes
  (attribute_id, entity_id, physical_name_text, friendly_name_text, data_type_text,
   is_primary_key_indicator, is_nullable_indicator, description_text,
   classification_code, glossary_term_text, quality_score, null_percentage) values
  (1,1,'invoice_id','Invoice ID','int8',true,false,'Primary key.','PUBLIC','Invoice ID',100,0.0),
  (2,1,'customer_id','Customer','int8',false,false,'Foreign key to AR_CUSTOMERS.','RESTRICTED','Customer',99.4,0.0),
  (3,1,'invoice_number','Invoice No.','varchar(50)',false,false,'Business identifier.','PUBLIC','Invoice No.',98.1,0.2),
  (4,1,'invoice_date','Invoice Date','date',false,false,'Issue date.','PUBLIC','Invoice Date',100,0.0),
  (5,1,'due_date','Due Date','date',false,true,'Payment due date.','PUBLIC','Due Date',94.6,1.4),
  (6,1,'currency_code','Currency','char(3)',false,false,'ISO-4217 currency code.','PUBLIC','Currency',100,0.0),
  (7,1,'total_amount','Invoice Total','numeric(18,2)',false,false,'Gross total amount.','RESTRICTED','Invoice Total',99.0,0.0),
  (8,1,'tax_amount','VAT Amount','numeric(18,2)',false,true,'VAT total.','RESTRICTED','VAT Amount',95.2,0.6),
  (9,1,'customer_email','Customer Email','varchar(255)',false,true,'Billing contact email.','PII','Email',87.4,3.8),
  (10,1,'customer_national_id','National ID','varchar(10)',false,false,'Saudi National ID.','PII','National ID',100,0.0),
  (11,1,'payment_terms_code','Payment Terms','varchar(20)',false,true,'Payment terms code (NET30, NET60).','PUBLIC','Payment Terms',96.7,0.4),
  (12,1,'status_code','Invoice Status','varchar(20)',false,false,'Lifecycle state.','PUBLIC','Invoice Status',99.8,0.0),
  (13,1,'created_at_timestamp','Created At','timestamp',false,false,'Audit timestamp.','PUBLIC','Created At',100,0.0),
  (14,1,'last_modified_user','Modified By','varchar(100)',false,true,'Audit user.','RESTRICTED','Modified By',98.9,0.1)
on conflict (attribute_id) do nothing;
select setval(pg_get_serial_sequence('bayanat.data_attributes','attribute_id'),
              (select coalesce(max(attribute_id),1) from bayanat.data_attributes));

-- ---------- Glossary roots ----------
insert into bayanat.business_glossaries (glossary_id, parent_glossary_id, term_name_text, definition_text) values
  (1, null, 'Finance',              'Finance domain glossary.'),
  (2, null, 'HR & Workforce',       'Human Resources and workforce.'),
  (3, null, 'Customer & Marketing', 'Customer 360, marketing channels, segmentation.'),
  (4, null, 'Compliance & Privacy', 'Compliance, classification and data subject rights.'),
  (5, null, 'Reference Data (KSA)', 'Standardized KSA reference lists.')
on conflict (glossary_id) do nothing;
select setval('bayanat.business_glossary_glossary_id_seq',
              (select coalesce(max(glossary_id),1) from bayanat.business_glossaries));
