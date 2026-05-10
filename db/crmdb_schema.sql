-- ─── CRM Database – Party Model Schema + Seed Data ──────────────────────────
CREATE SCHEMA IF NOT EXISTS crm;

-- ── Core Party Tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.party (
  party_id      SERIAL PRIMARY KEY,
  party_type    VARCHAR(20)  NOT NULL CHECK (party_type IN ('PERSON','ORGANIZATION')),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  external_ref  VARCHAR(100),
  source_system VARCHAR(50)  DEFAULT 'MANUAL',
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.person (
  party_id         INT PRIMARY KEY REFERENCES crm.party(party_id) ON DELETE CASCADE,
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  middle_name      VARCHAR(100),
  preferred_name   VARCHAR(100),
  date_of_birth    DATE,
  gender_code      VARCHAR(10)  CHECK (gender_code IN ('M','F','OTHER','UNKNOWN')),
  nationality_code CHAR(2),
  national_id      VARCHAR(50),
  passport_no      VARCHAR(50),
  marital_status   VARCHAR(20),
  education_level  VARCHAR(30),
  occupation       VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS crm.organization (
  party_id        INT PRIMARY KEY REFERENCES crm.party(party_id) ON DELETE CASCADE,
  org_name        VARCHAR(255) NOT NULL,
  trade_name      VARCHAR(255),
  legal_form      VARCHAR(50),
  registration_no VARCHAR(100),
  tax_id          VARCHAR(100),
  industry_code   VARCHAR(50),
  industry_name   VARCHAR(100),
  org_size_code   VARCHAR(20)  CHECK (org_size_code IN ('MICRO','SMALL','MEDIUM','LARGE','ENTERPRISE')),
  employee_count  INT,
  annual_revenue  NUMERIC(18,2),
  founded_year    INT,
  website         VARCHAR(255),
  parent_party_id INT REFERENCES crm.party(party_id)
);

-- ── Role Model ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.party_role_type (
  role_type_code VARCHAR(30) PRIMARY KEY,
  role_type_name VARCHAR(100) NOT NULL,
  applies_to     VARCHAR(20)  CHECK (applies_to IN ('PERSON','ORGANIZATION','BOTH')),
  description    TEXT
);

CREATE TABLE IF NOT EXISTS crm.party_role (
  party_role_id  SERIAL PRIMARY KEY,
  party_id       INT         NOT NULL REFERENCES crm.party(party_id) ON DELETE CASCADE,
  role_type_code VARCHAR(30) NOT NULL REFERENCES crm.party_role_type(role_type_code),
  valid_from     DATE        NOT NULL DEFAULT CURRENT_DATE,
  valid_to       DATE,
  status_code    VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status_code IN ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ── Contact Model ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.contact_mechanism (
  contact_id     SERIAL PRIMARY KEY,
  mechanism_type VARCHAR(30) NOT NULL CHECK (mechanism_type IN ('EMAIL','PHONE','MOBILE','FAX','ADDRESS','SOCIAL','WEB')),
  contact_value  VARCHAR(500) NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  is_verified    BOOLEAN NOT NULL DEFAULT false,
  verified_at    TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.party_contact (
  party_contact_id SERIAL PRIMARY KEY,
  party_id         INT NOT NULL REFERENCES crm.party(party_id) ON DELETE CASCADE,
  contact_id       INT NOT NULL REFERENCES crm.contact_mechanism(contact_id) ON DELETE CASCADE,
  contact_purpose  VARCHAR(30) CHECK (contact_purpose IN ('HOME','WORK','BILLING','SHIPPING','MARKETING','PRIMARY')),
  valid_from       DATE DEFAULT CURRENT_DATE,
  valid_to         DATE
);

-- ── Address Model ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.address (
  address_id     SERIAL PRIMARY KEY,
  address_line1  VARCHAR(255) NOT NULL,
  address_line2  VARCHAR(255),
  district       VARCHAR(100),
  city           VARCHAR(100) NOT NULL,
  emirate        VARCHAR(100),
  state_province VARCHAR(100),
  postal_code    VARCHAR(20),
  country_code   CHAR(2) NOT NULL DEFAULT 'AE',
  latitude       NUMERIC(9,6),
  longitude      NUMERIC(9,6),
  address_type   VARCHAR(20) DEFAULT 'PHYSICAL' CHECK (address_type IN ('PHYSICAL','POSTAL','REGISTERED'))
);

CREATE TABLE IF NOT EXISTS crm.party_address (
  party_address_id SERIAL PRIMARY KEY,
  party_id         INT NOT NULL REFERENCES crm.party(party_id) ON DELETE CASCADE,
  address_id       INT NOT NULL REFERENCES crm.address(address_id) ON DELETE CASCADE,
  address_purpose  VARCHAR(30) CHECK (address_purpose IN ('HOME','WORK','BILLING','SHIPPING','PRIMARY')),
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  valid_from       DATE DEFAULT CURRENT_DATE,
  valid_to         DATE
);

-- ── Party Relationship ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.party_relationship (
  relationship_id   SERIAL PRIMARY KEY,
  from_party_id     INT NOT NULL REFERENCES crm.party(party_id),
  to_party_id       INT NOT NULL REFERENCES crm.party(party_id),
  relationship_type VARCHAR(50) NOT NULL,
  relationship_role VARCHAR(50),
  valid_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to          DATE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Segmentation ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.segment (
  segment_id   SERIAL PRIMARY KEY,
  segment_code VARCHAR(30) NOT NULL UNIQUE,
  segment_name VARCHAR(100) NOT NULL,
  segment_type VARCHAR(30) CHECK (segment_type IN ('INDUSTRY','TIER','GEOGRAPHY','LIFECYCLE','BEHAVIOURAL','CUSTOM')),
  applies_to   VARCHAR(20) CHECK (applies_to IN ('PERSON','ORGANIZATION','BOTH')),
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS crm.party_segment (
  party_id    INT NOT NULL REFERENCES crm.party(party_id) ON DELETE CASCADE,
  segment_id  INT NOT NULL REFERENCES crm.segment(segment_id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  assigned_by VARCHAR(100),
  valid_from  DATE DEFAULT CURRENT_DATE,
  valid_to    DATE,
  PRIMARY KEY (party_id, segment_id)
);

-- ── Customer Account ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.customer_account (
  account_id        SERIAL PRIMARY KEY,
  party_id          INT NOT NULL UNIQUE REFERENCES crm.party(party_id),
  account_no        VARCHAR(50) NOT NULL UNIQUE,
  account_type      VARCHAR(30) CHECK (account_type IN ('INDIVIDUAL','CORPORATE','VIP','GOVERNMENT')),
  tier_code         VARCHAR(20) CHECK (tier_code IN ('BRONZE','SILVER','GOLD','PLATINUM','DIAMOND')),
  relationship_mgr  INT REFERENCES crm.party(party_id),
  acquisition_source VARCHAR(50),
  acquisition_date  DATE,
  lifetime_value    NUMERIC(18,2) DEFAULT 0,
  credit_limit      NUMERIC(18,2),
  credit_score      INT,
  kyc_status        VARCHAR(20) DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  kyc_verified_at   TIMESTAMP,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Product Catalogue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.product (
  product_id   SERIAL PRIMARY KEY,
  product_code VARCHAR(50) NOT NULL UNIQUE,
  product_name VARCHAR(255) NOT NULL,
  product_type VARCHAR(50) CHECK (product_type IN ('GOODS','SERVICE','SUBSCRIPTION','BUNDLE')),
  category     VARCHAR(100),
  sub_category VARCHAR(100),
  unit_price   NUMERIC(15,2),
  uom          VARCHAR(20),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  launched_at  DATE,
  description  TEXT
);

-- ── Opportunity ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.opportunity (
  opportunity_id  SERIAL PRIMARY KEY,
  opportunity_ref VARCHAR(50) NOT NULL UNIQUE,
  party_id        INT NOT NULL REFERENCES crm.party(party_id),
  owner_party_id  INT REFERENCES crm.party(party_id),
  opportunity_name VARCHAR(255) NOT NULL,
  stage_code      VARCHAR(30) NOT NULL CHECK (stage_code IN ('PROSPECT','QUALIFIED','PROPOSAL','NEGOTIATION','CLOSED_WON','CLOSED_LOST')),
  probability_pct NUMERIC(5,2),
  est_value       NUMERIC(15,2),
  close_date_est  DATE,
  loss_reason     VARCHAR(100),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS crm.opportunity_product (
  opp_product_id SERIAL PRIMARY KEY,
  opportunity_id INT NOT NULL REFERENCES crm.opportunity(opportunity_id) ON DELETE CASCADE,
  product_id     INT NOT NULL REFERENCES crm.product(product_id),
  quantity       NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price     NUMERIC(15,2),
  discount_pct   NUMERIC(5,2) DEFAULT 0
);

-- ── Interaction / Communication ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.interaction (
  interaction_id   SERIAL PRIMARY KEY,
  party_id         INT NOT NULL REFERENCES crm.party(party_id),
  opportunity_id   INT REFERENCES crm.opportunity(opportunity_id),
  channel_code     VARCHAR(30) NOT NULL CHECK (channel_code IN ('EMAIL','CALL','MEETING','CHAT','SMS','SOCIAL','IN_PERSON')),
  direction_code   VARCHAR(10) CHECK (direction_code IN ('INBOUND','OUTBOUND','INTERNAL')),
  subject          VARCHAR(500),
  summary          TEXT,
  sentiment_score  NUMERIC(3,2),
  duration_seconds INT,
  occurred_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  recorded_by      INT REFERENCES crm.party(party_id),
  follow_up_date   DATE,
  outcome_code     VARCHAR(30)
);

-- ── Service Case ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.service_case (
  case_id            SERIAL PRIMARY KEY,
  case_ref           VARCHAR(50) NOT NULL UNIQUE,
  party_id           INT NOT NULL REFERENCES crm.party(party_id),
  account_id         INT REFERENCES crm.customer_account(account_id),
  case_type          VARCHAR(50) CHECK (case_type IN ('COMPLAINT','INQUIRY','REQUEST','FEEDBACK','ESCALATION')),
  priority_code      VARCHAR(10) CHECK (priority_code IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status_code        VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status_code IN ('OPEN','IN_PROGRESS','PENDING','RESOLVED','CLOSED')),
  subject            VARCHAR(500) NOT NULL,
  description        TEXT,
  channel_code       VARCHAR(30),
  assigned_to        INT REFERENCES crm.party(party_id),
  opened_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  first_response_at  TIMESTAMP,
  resolved_at        TIMESTAMP,
  closed_at          TIMESTAMP,
  satisfaction_score NUMERIC(3,1),
  resolution_notes   TEXT
);

-- ── Sales Order ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.sales_order (
  order_id            SERIAL PRIMARY KEY,
  order_ref           VARCHAR(50) NOT NULL UNIQUE,
  party_id            INT NOT NULL REFERENCES crm.party(party_id),
  account_id          INT REFERENCES crm.customer_account(account_id),
  opportunity_id      INT REFERENCES crm.opportunity(opportunity_id),
  order_status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (order_status IN ('DRAFT','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED','REFUNDED')),
  order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date_est   DATE,
  delivery_date_act   DATE,
  subtotal            NUMERIC(15,2),
  discount_amount     NUMERIC(15,2) DEFAULT 0,
  tax_amount          NUMERIC(15,2) DEFAULT 0,
  total_amount        NUMERIC(15,2),
  currency_code       CHAR(3) DEFAULT 'AED',
  payment_status      VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PARTIAL','PAID','REFUNDED')),
  notes               TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.order_line (
  order_line_id SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES crm.sales_order(order_id) ON DELETE CASCADE,
  product_id    INT NOT NULL REFERENCES crm.product(product_id),
  quantity      NUMERIC(10,2) NOT NULL,
  unit_price    NUMERIC(15,2) NOT NULL,
  discount_pct  NUMERIC(5,2) DEFAULT 0,
  line_total    NUMERIC(15,2),
  notes         TEXT
);

-- ── Payment ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.payment (
  payment_id     SERIAL PRIMARY KEY,
  order_id       INT NOT NULL REFERENCES crm.sales_order(order_id),
  payment_method VARCHAR(30) CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','CHEQUE','CREDIT')),
  amount         NUMERIC(15,2) NOT NULL,
  currency_code  CHAR(3) DEFAULT 'AED',
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no   VARCHAR(100),
  status_code    VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status_code IN ('PENDING','PROCESSING','COMPLETED','FAILED','REFUNDED')),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Campaign ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.campaign (
  campaign_id       SERIAL PRIMARY KEY,
  campaign_code     VARCHAR(50) NOT NULL UNIQUE,
  campaign_name     VARCHAR(255) NOT NULL,
  campaign_type     VARCHAR(50) CHECK (campaign_type IN ('EMAIL','SMS','SOCIAL','EVENT','WEBINAR','DIRECT_MAIL','DIGITAL')),
  status_code       VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status_code IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
  start_date        DATE,
  end_date          DATE,
  budget            NUMERIC(15,2),
  actual_spend      NUMERIC(15,2),
  leads_generated   INT DEFAULT 0,
  conversions       INT DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.campaign_response (
  response_id   SERIAL PRIMARY KEY,
  campaign_id   INT NOT NULL REFERENCES crm.campaign(campaign_id),
  party_id      INT NOT NULL REFERENCES crm.party(party_id),
  response_type VARCHAR(30) CHECK (response_type IN ('OPEN','CLICK','SUBMIT','CALL','PURCHASE','OPT_OUT')),
  responded_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  channel_code  VARCHAR(30),
  converted     BOOLEAN DEFAULT false,
  notes         TEXT
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_party_role_party    ON crm.party_role(party_id);
CREATE INDEX IF NOT EXISTS idx_party_contact_party ON crm.party_contact(party_id);
CREATE INDEX IF NOT EXISTS idx_party_address_party ON crm.party_address(party_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_party   ON crm.opportunity(party_id);
CREATE INDEX IF NOT EXISTS idx_interaction_party   ON crm.interaction(party_id);
CREATE INDEX IF NOT EXISTS idx_service_case_party  ON crm.service_case(party_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_party   ON crm.sales_order(party_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resp_party ON crm.campaign_response(party_id);

-- ─── Seed Data ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  -- Person IDs
  p1  INT; p2  INT; p3  INT; p4  INT; p5  INT;
  p6  INT; p7  INT; p8  INT; p9  INT; p10 INT;
  p11 INT; p12 INT; p13 INT; p14 INT; p15 INT;
  -- Org IDs
  o1 INT; o2 INT; o3 INT; o4 INT; o5 INT;
  -- Account IDs
  a1 INT; a2 INT; a3 INT; a4 INT;  a5 INT;
  a6 INT; a7 INT; a8 INT; a9 INT;  a10 INT;
  a11 INT; a12 INT;
  ao1 INT; ao2 INT; ao3 INT; ao4 INT; ao5 INT;
  -- Segment IDs
  sg1 INT; sg2 INT; sg3 INT; sg4 INT; sg5 INT;
  -- Product IDs
  pr1 INT; pr2 INT; pr3 INT; pr4 INT; pr5 INT;
  pr6 INT; pr7 INT; pr8 INT; pr9 INT; pr10 INT;
  -- Opportunity IDs
  op1 INT; op2 INT; op3 INT; op4 INT; op5 INT;
  op6 INT; op7 INT; op8 INT; op9 INT; op10 INT;
  -- Order IDs
  or1 INT; or2 INT; or3 INT; or4 INT; or5 INT; or6 INT; or7 INT; or8 INT;
  -- Campaign IDs
  ca1 INT; ca2 INT;
  -- Contact + Address temp IDs
  cx INT; ax INT;
BEGIN

  -- ── Reference Data ─────────────────────────────────────────────────────────
  INSERT INTO crm.party_role_type (role_type_code, role_type_name, applies_to, description) VALUES
    ('CUSTOMER',  'Customer',             'BOTH',        'Party that purchases products or services'),
    ('EMPLOYEE',  'Employee',             'PERSON',      'Internal staff member'),
    ('SALES_REP', 'Sales Representative', 'PERSON',      'Sales team member managing client accounts'),
    ('SUPPLIER',  'Supplier',             'ORGANIZATION','Third-party goods or services provider'),
    ('PARTNER',   'Business Partner',     'ORGANIZATION','Authorised reseller or delivery partner'),
    ('PROSPECT',  'Prospect',             'BOTH',        'Pre-sales lead not yet converted to customer');

  INSERT INTO crm.segment (segment_code, segment_name, segment_type, applies_to, description) VALUES
    ('ENT_CORP',  'Enterprise Corporate', 'TIER',      'ORGANIZATION','Strategic enterprise accounts with 250+ employees'),
    ('SMB_CORP',  'SMB Corporate',        'TIER',      'ORGANIZATION','Small to medium business accounts'),
    ('INDIV_VIP', 'Individual VIP',       'TIER',      'PERSON',      'High-value individual customers (lifetime > 50k AED)'),
    ('INDIV_STD', 'Individual Standard',  'TIER',      'PERSON',      'Standard retail individual customers'),
    ('DORMANT',   'Dormant',              'LIFECYCLE', 'BOTH',        'No transactions or engagement in 12+ months');
  SELECT segment_id INTO sg1 FROM crm.segment WHERE segment_code = 'ENT_CORP';
  SELECT segment_id INTO sg2 FROM crm.segment WHERE segment_code = 'SMB_CORP';
  SELECT segment_id INTO sg3 FROM crm.segment WHERE segment_code = 'INDIV_VIP';
  SELECT segment_id INTO sg4 FROM crm.segment WHERE segment_code = 'INDIV_STD';
  SELECT segment_id INTO sg5 FROM crm.segment WHERE segment_code = 'DORMANT';

  INSERT INTO crm.product (product_code, product_name, product_type, category, unit_price, uom, description) VALUES
    ('DGP_ENT',    'Data Governance Platform – Enterprise', 'SERVICE',      'Platform',  50000, 'LICENSE', 'Full enterprise data governance platform, unlimited users'),
    ('DGP_PRO',    'Data Governance Platform – Pro',        'SERVICE',      'Platform',  20000, 'LICENSE', 'Professional edition for teams up to 50 named users'),
    ('DGP_STD',    'Data Governance Platform – Standard',   'SERVICE',      'Platform',   8000, 'LICENSE', 'Standard edition for small teams up to 10 users'),
    ('DQM_MOD',    'Data Quality Module',                   'SUBSCRIPTION', 'Module',    12000, 'YEAR',    'Annual subscription for data quality monitoring add-on'),
    ('META_SUITE', 'Metadata Management Suite',             'SERVICE',      'Platform',  30000, 'LICENSE', 'Comprehensive metadata cataloguing and lineage tool'),
    ('IMPL_SVC',   'Implementation Services',               'SERVICE',      'Services',  15000, 'PROJECT', 'Professional implementation and configuration services'),
    ('TRAIN_BASIC','Training – Basic Package',              'SERVICE',      'Training',   2000, 'SESSION', '1-day onboarding training for administrators'),
    ('TRAIN_ADV',  'Training – Advanced Package',           'SERVICE',      'Training',   5000, 'SESSION', '3-day advanced certification training program'),
    ('SUPP_ANNUAL','Annual Support & Maintenance',          'SUBSCRIPTION', 'Support',    8000, 'YEAR',    '24×7 priority support with guaranteed 4-hour SLA'),
    ('CONS_MON',   'Consulting Retainer (Monthly)',         'SERVICE',      'Services',   3000, 'MONTH',   'Monthly consulting retainer for ongoing data governance advisory');
  SELECT product_id INTO pr1  FROM crm.product WHERE product_code = 'DGP_ENT';
  SELECT product_id INTO pr2  FROM crm.product WHERE product_code = 'DGP_PRO';
  SELECT product_id INTO pr3  FROM crm.product WHERE product_code = 'DGP_STD';
  SELECT product_id INTO pr4  FROM crm.product WHERE product_code = 'DQM_MOD';
  SELECT product_id INTO pr5  FROM crm.product WHERE product_code = 'META_SUITE';
  SELECT product_id INTO pr6  FROM crm.product WHERE product_code = 'IMPL_SVC';
  SELECT product_id INTO pr7  FROM crm.product WHERE product_code = 'TRAIN_BASIC';
  SELECT product_id INTO pr8  FROM crm.product WHERE product_code = 'TRAIN_ADV';
  SELECT product_id INTO pr9  FROM crm.product WHERE product_code = 'SUPP_ANNUAL';
  SELECT product_id INTO pr10 FROM crm.product WHERE product_code = 'CONS_MON';

  -- ── Person Parties ─────────────────────────────────────────────────────────
  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p1;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p1,'Ahmed','Al-Rashidi','1985-03-15','M','AE','Business Executive');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p2;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p2,'Fatima','Al-Mansoori','1990-07-22','F','AE','Strategy Consultant');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p3;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p3,'Mohammed','Al-Hammadi','1978-11-05','M','AE','IT Systems Engineer');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p4;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p4,'Sarah','Johnson','1988-05-30','F','GB','Digital Transformation Director');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p5;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p5,'David','Chen','1982-09-14','M','CN','IT Operations Manager');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p6;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p6,'Layla','Al-Farsi','1995-02-18','F','AE','Data Analyst');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p7;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p7,'Omar','Al-Bargouthi','1987-12-01','M','JO','Senior Programme Manager');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p8;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p8,'Aisha','Al-Khatib','1992-04-25','F','AE','Compliance & Risk Officer');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p9;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p9,'Tariq','Mahmoud','1975-08-10','M','EG','Chief Executive Officer');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p10;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p10,'Hessa','Al-Nahdi','1986-01-30','F','AE','Chief Operating Officer');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p11;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p11,'Abdullah','Al-Suwaidi','1980-06-15','M','AE','Managing Director');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p12;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p12,'Reem','Al-Hajri','1993-10-08','F','AE','Strategy & Innovation Executive');

  -- Internal staff
  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p13;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p13,'James','Wilson','1979-07-19','M','US','Senior Sales Executive');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p14;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p14,'Noura','Al-Hamdan','1991-03-27','F','AE','Key Account Manager');

  INSERT INTO crm.party (party_type) VALUES ('PERSON') RETURNING party_id INTO p15;
  INSERT INTO crm.person (party_id,first_name,last_name,date_of_birth,gender_code,nationality_code,occupation)
    VALUES (p15,'Khalid','Al-Muhairi','1984-09-02','M','AE','Sales Director');

  -- ── Organization Parties ───────────────────────────────────────────────────
  INSERT INTO crm.party (party_type) VALUES ('ORGANIZATION') RETURNING party_id INTO o1;
  INSERT INTO crm.organization (party_id,org_name,trade_name,industry_code,industry_name,org_size_code,employee_count,annual_revenue,website)
    VALUES (o1,'Al-Zubair Holdings LLC','Al-Zubair','FINANCE','Financial Services','ENTERPRISE',850,450000000,'www.alzubair.ae');

  INSERT INTO crm.party (party_type) VALUES ('ORGANIZATION') RETURNING party_id INTO o2;
  INSERT INTO crm.organization (party_id,org_name,industry_code,industry_name,org_size_code,employee_count,annual_revenue,website)
    VALUES (o2,'Emirates Tech Solutions FZ-LLC','TECHNOLOGY','Information Technology','LARGE',320,85000000,'www.emiratestech.ae');

  INSERT INTO crm.party (party_type) VALUES ('ORGANIZATION') RETURNING party_id INTO o3;
  INSERT INTO crm.organization (party_id,org_name,industry_code,industry_name,org_size_code,employee_count,annual_revenue,website)
    VALUES (o3,'Gulf Commerce Group','RETAIL','Retail & E-Commerce','MEDIUM',180,42000000,'www.gulfcommerce.ae');

  INSERT INTO crm.party (party_type) VALUES ('ORGANIZATION') RETURNING party_id INTO o4;
  INSERT INTO crm.organization (party_id,org_name,industry_code,industry_name,org_size_code,employee_count,annual_revenue,website)
    VALUES (o4,'Masar Consulting Partners','CONSULTING','Management Consulting','SMALL',45,12000000,'www.masar.ae');

  INSERT INTO crm.party (party_type) VALUES ('ORGANIZATION') RETURNING party_id INTO o5;
  INSERT INTO crm.organization (party_id,org_name,industry_code,industry_name,org_size_code,employee_count,annual_revenue,website)
    VALUES (o5,'Arabian Steel Industries JSC','MANUFACTURING','Steel & Metal Manufacturing','LARGE',1200,380000000,'www.arabiansteel.ae');

  -- ── Party Roles ────────────────────────────────────────────────────────────
  INSERT INTO crm.party_role (party_id, role_type_code) VALUES
    (p1,'CUSTOMER'),(p2,'CUSTOMER'),(p3,'CUSTOMER'),(p4,'CUSTOMER'),
    (p5,'CUSTOMER'),(p6,'CUSTOMER'),(p7,'CUSTOMER'),(p8,'CUSTOMER'),
    (p9,'CUSTOMER'),(p10,'CUSTOMER'),(p11,'CUSTOMER'),(p12,'CUSTOMER'),
    (p13,'EMPLOYEE'),(p13,'SALES_REP'),
    (p14,'EMPLOYEE'),
    (p15,'EMPLOYEE'),(p15,'SALES_REP'),
    (o1,'CUSTOMER'),(o2,'CUSTOMER'),(o3,'CUSTOMER'),(o4,'CUSTOMER'),(o5,'CUSTOMER');

  -- ── Contacts ───────────────────────────────────────────────────────────────
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','ahmed.alrashidi@email.ae',true,true,'2023-02-15') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p1,cx,'PRIMARY');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234001',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p1,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','fatima.almansoori@email.ae',true,true,'2022-09-10') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p2,cx,'PRIMARY');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234002',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p2,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','m.alhammadi@email.ae',true,true,'2024-01-25') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p3,cx,'PRIMARY');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234003',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p3,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','sarah.johnson@techco.ae',true,true,'2023-06-18') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p4,cx,'WORK');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234004',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p4,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','david.chen@techops.ae',true,true,'2024-03-12') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p5,cx,'WORK');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234005',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p5,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','layla.alfarsi@email.ae',true,true,'2024-08-18') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p6,cx,'PRIMARY');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','omar.albargouthi@email.ae',true,true,'2023-11-08') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p7,cx,'PRIMARY');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('MOBILE','+971501234007',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p7,cx,'HOME');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','aisha.alkhatib@email.ae',true,true,'2024-02-22') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p8,cx,'PRIMARY');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','tariq.mahmoud@emirtech.ae',true,true,'2022-05-20') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p9,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','hessa.alnahdi@email.ae',true,true,'2021-08-10') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p10,cx,'PRIMARY');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','abdullah.alsuwaidi@masar.ae',true,true,'2023-05-02') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p11,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','reem.alhajri@email.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p12,cx,'PRIMARY');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','james.wilson@bayanatix.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p13,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','noura.alhamdan@bayanatix.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p14,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','khalid.almuhairi@bayanatix.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (p15,cx,'WORK');

  -- Org contacts
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','info@alzubair.ae',true,true,'2020-03-10') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o1,cx,'WORK');
  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('PHONE','+97142001001',false) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o1,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary,is_verified,verified_at) VALUES ('EMAIL','info@emiratestech.ae',true,true,'2023-09-20') RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o2,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','contact@gulfcommerce.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o3,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','hello@masar.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o4,cx,'WORK');

  INSERT INTO crm.contact_mechanism (mechanism_type,contact_value,is_primary) VALUES ('EMAIL','info@arabiansteel.ae',true) RETURNING contact_id INTO cx;
  INSERT INTO crm.party_contact (party_id,contact_id,contact_purpose) VALUES (o5,cx,'WORK');

  -- ── Addresses ──────────────────────────────────────────────────────────────
  INSERT INTO crm.address (address_line1,city,emirate,country_code,address_type)
    VALUES ('Villa 23, Al Wasl Road, Jumeirah 1','Dubai','Dubai','AE','PHYSICAL') RETURNING address_id INTO ax;
  INSERT INTO crm.party_address (party_id,address_id,address_purpose,is_primary) VALUES (p1,ax,'HOME',true);

  INSERT INTO crm.address (address_line1,city,emirate,country_code,address_type)
    VALUES ('Apartment 14B, Al Reem Island Tower 3','Abu Dhabi','Abu Dhabi','AE','PHYSICAL') RETURNING address_id INTO ax;
  INSERT INTO crm.party_address (party_id,address_id,address_purpose,is_primary) VALUES (p2,ax,'HOME',true);

  INSERT INTO crm.address (address_line1,city,emirate,country_code,address_type)
    VALUES ('Floor 23, ICD Brookfield Place, DIFC','Dubai','Dubai','AE','PHYSICAL') RETURNING address_id INTO ax;
  INSERT INTO crm.party_address (party_id,address_id,address_purpose,is_primary) VALUES (o1,ax,'PRIMARY',true);

  INSERT INTO crm.address (address_line1,city,emirate,country_code,address_type)
    VALUES ('Building 4, Dubai Internet City','Dubai','Dubai','AE','PHYSICAL') RETURNING address_id INTO ax;
  INSERT INTO crm.party_address (party_id,address_id,address_purpose,is_primary) VALUES (o2,ax,'PRIMARY',true);

  INSERT INTO crm.address (address_line1,city,emirate,country_code,address_type)
    VALUES ('Musaffah Industrial Area, Zone M-14','Abu Dhabi','Abu Dhabi','AE','PHYSICAL') RETURNING address_id INTO ax;
  INSERT INTO crm.party_address (party_id,address_id,address_purpose,is_primary) VALUES (o5,ax,'PRIMARY',true);

  -- ── Party Relationships ────────────────────────────────────────────────────
  INSERT INTO crm.party_relationship (from_party_id,to_party_id,relationship_type,relationship_role) VALUES
    (p1,  o1, 'EMPLOYED_BY', 'Senior Executive'),
    (p9,  o2, 'EMPLOYED_BY', 'Chief Executive'),
    (p10, o3, 'EMPLOYED_BY', 'Chief Operating Officer'),
    (p11, o4, 'EMPLOYED_BY', 'Managing Director'),
    (p7,  o5, 'EMPLOYED_BY', 'Senior Programme Manager'),
    (p12, o1, 'CONTACT_OF',  'Procurement Lead');

  -- ── Customer Accounts ──────────────────────────────────────────────────────
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p1,'ACC-IND-001','INDIVIDUAL','GOLD',    p15,'REFERRAL',  '2023-02-10',100000,'VERIFIED','2023-02-15 10:30:00',28000) RETURNING account_id INTO a1;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p2,'ACC-IND-002','VIP',      'PLATINUM', p14,'MARKETING', '2022-09-05',250000,'VERIFIED','2022-09-10 09:00:00',56000) RETURNING account_id INTO a2;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p3,'ACC-IND-003','INDIVIDUAL','SILVER',  p13,'WEBSITE',   '2024-01-20', 50000,'VERIFIED','2024-01-25 11:00:00',20000) RETURNING account_id INTO a3;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p4,'ACC-IND-004','INDIVIDUAL','GOLD',    p13,'CONFERENCE','2023-06-12', 80000,'VERIFIED','2023-06-18 14:00:00',13000) RETURNING account_id INTO a4;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p5,'ACC-IND-005','INDIVIDUAL','SILVER',  p14,'REFERRAL',  '2024-03-08', 60000,'VERIFIED','2024-03-12 10:00:00',0)     RETURNING account_id INTO a5;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p6,'ACC-IND-006','INDIVIDUAL','BRONZE',  p14,'WEBSITE',   '2024-08-15', 20000,'VERIFIED','2024-08-18 09:30:00',0)     RETURNING account_id INTO a6;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p7,'ACC-IND-007','INDIVIDUAL','GOLD',    p15,'REFERRAL',  '2023-11-02',100000,'VERIFIED','2023-11-08 13:00:00',36000) RETURNING account_id INTO a7;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p8,'ACC-IND-008','INDIVIDUAL','SILVER',  p13,'CONFERENCE','2024-02-19', 40000,'VERIFIED','2024-02-22 11:30:00',0)     RETURNING account_id INTO a8;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p9,'ACC-IND-009','INDIVIDUAL','PLATINUM',p15,'STRATEGIC', '2022-05-14',500000,'VERIFIED','2022-05-20 10:00:00',8000)  RETURNING account_id INTO a9;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p10,'ACC-IND-010','VIP',     'DIAMOND',  p15,'REFERRAL',  '2021-08-03',1000000,'VERIFIED','2021-08-10 09:00:00',16000) RETURNING account_id INTO a10;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p11,'ACC-IND-011','INDIVIDUAL','GOLD',   p14,'REFERRAL',  '2023-04-27',120000,'VERIFIED','2023-05-02 11:00:00',0)     RETURNING account_id INTO a11;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (p12,'ACC-IND-012','INDIVIDUAL','BRONZE', p14,'WEBSITE',   '2024-10-05', 30000,'PENDING', NULL,                 0)     RETURNING account_id INTO a12;
  -- Corporate accounts
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (o1,'ACC-COR-001','CORPORATE','DIAMOND',  p15,'STRATEGIC', '2020-03-01',5000000,'VERIFIED','2020-03-10 10:00:00',73000) RETURNING account_id INTO ao1;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (o2,'ACC-COR-002','CORPORATE','GOLD',     p13,'CONFERENCE','2023-09-15',2000000,'VERIFIED','2023-09-20 09:00:00',0)     RETURNING account_id INTO ao2;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (o3,'ACC-COR-003','CORPORATE','SILVER',   p14,'MARKETING', '2024-01-10', 800000,'VERIFIED','2024-01-15 10:00:00',0)    RETURNING account_id INTO ao3;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (o4,'ACC-COR-004','CORPORATE','GOLD',     p15,'REFERRAL',  '2023-07-20', 500000,'VERIFIED','2023-07-25 11:00:00',38000) RETURNING account_id INTO ao4;
  INSERT INTO crm.customer_account (party_id,account_no,account_type,tier_code,relationship_mgr,acquisition_source,acquisition_date,credit_limit,kyc_status,kyc_verified_at,lifetime_value)
    VALUES (o5,'ACC-COR-005','CORPORATE','PLATINUM', p15,'STRATEGIC', '2022-11-05',3000000,'PENDING', NULL,                 0)     RETURNING account_id INTO ao5;

  -- ── Party Segments ─────────────────────────────────────────────────────────
  INSERT INTO crm.party_segment (party_id,segment_id,assigned_by) VALUES
    (o1,sg1,'system'),(o2,sg1,'system'),(o5,sg1,'system'),
    (o3,sg2,'system'),(o4,sg2,'system'),
    (p2,sg3,'system'),(p10,sg3,'system'),(p9,sg3,'system'),
    (p1,sg4,'system'),(p4,sg4,'system'),(p5,sg4,'system'),
    (p7,sg4,'system'),(p11,sg4,'system'),
    (p3,sg5,'system'),(p12,sg5,'system');

  -- ── Opportunities ──────────────────────────────────────────────────────────
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-001',o1,p15,'Enterprise Platform + Full Implementation','CLOSED_WON',100,65000,'2025-03-31') RETURNING opportunity_id INTO op1;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-002',o2,p13,'Pro Platform + Data Quality Module','NEGOTIATION',70,32000,'2026-06-30') RETURNING opportunity_id INTO op2;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-003',o3,p14,'Enterprise Platform – Gulf Commerce','PROPOSAL',40,50000,'2026-07-31') RETURNING opportunity_id INTO op3;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-004',p4,p13,'Advanced Training + Standard Platform','CLOSED_WON',100,13000,'2025-04-15') RETURNING opportunity_id INTO op4;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-005',o4,p15,'Metadata Suite + Annual Support','QUALIFIED',55,38000,'2026-09-30') RETURNING opportunity_id INTO op5;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-006',o5,p15,'Full Enterprise Suite – Phase 1','PROSPECT',20,80000,'2026-12-31') RETURNING opportunity_id INTO op6;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est,loss_reason)
    VALUES ('OPP-2024-007',p3,p13,'Pro Platform – Individual Licence','CLOSED_LOST',0,20000,'2024-12-31','Budget freeze – postponed to next FY') RETURNING opportunity_id INTO op7;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-008',p5,p14,'Pro Platform + Training Bundle','PROPOSAL',35,25000,'2026-07-15') RETURNING opportunity_id INTO op8;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-009',p10,p14,'Annual Support Renewal','QUALIFIED',80,8000,'2026-06-01') RETURNING opportunity_id INTO op9;
  INSERT INTO crm.opportunity (opportunity_ref,party_id,owner_party_id,opportunity_name,stage_code,probability_pct,est_value,close_date_est)
    VALUES ('OPP-2025-010',p7,p15,'Consulting Retainer – 12 Months','NEGOTIATION',65,36000,'2026-06-15') RETURNING opportunity_id INTO op10;

  INSERT INTO crm.opportunity_product (opportunity_id,product_id,quantity,unit_price,discount_pct) VALUES
    (op1,pr1,1,50000,0),(op1,pr6,1,15000,0),
    (op2,pr2,1,20000,0),(op2,pr4,1,12000,0),
    (op3,pr1,1,50000,0),
    (op4,pr3,1,8000,0),(op4,pr8,1,5000,0),
    (op5,pr5,1,30000,0),(op5,pr9,1,8000,0),
    (op6,pr1,1,50000,0),(op6,pr6,1,15000,0),(op6,pr9,1,8000,0),(op6,pr7,2,2000,0),
    (op7,pr2,1,20000,0),
    (op8,pr2,1,20000,0),(op8,pr8,1,5000,0),
    (op9,pr9,1,8000,0),
    (op10,pr10,12,3000,0);

  -- ── Interactions ───────────────────────────────────────────────────────────
  INSERT INTO crm.interaction (party_id,opportunity_id,channel_code,direction_code,subject,summary,occurred_at,recorded_by,outcome_code) VALUES
    (o1,op1,'MEETING','OUTBOUND','Initial Discovery Workshop','Explored data governance maturity; identified 3 key pain points around metadata management and stewardship','2024-10-15 10:00:00',p15,'INTERESTED'),
    (o1,op1,'EMAIL','OUTBOUND','Platform Demo Follow-up','Sent recording and addressed questions about data lineage and stewardship workflows','2024-10-22 09:30:00',p15,'POSITIVE'),
    (o1,op1,'CALL','INBOUND','Commercial Query – Pricing','Client requested detailed pricing for enterprise tier and annual support options','2024-11-05 14:00:00',p13,'FOLLOW_UP'),
    (o1,op1,'MEETING','OUTBOUND','Contract Negotiation – Final Session','Agreed terms; final sign-off pending legal review','2025-01-28 11:00:00',p15,'AGREEMENT'),
    (o2,op2,'CALL','OUTBOUND','Qualification Call – Data Stack','Discussed current tools and mapped to product capabilities','2025-02-10 15:30:00',p13,'QUALIFIED'),
    (o2,op2,'MEETING','OUTBOUND','Technical Deep Dive','Ran through API integration requirements; IT team very engaged','2025-03-05 10:00:00',p13,'POSITIVE'),
    (o2,op2,'CALL','OUTBOUND','Commercial Proposal Walkthrough','Walked through itemised proposal; client requested multi-year discount','2026-04-28 15:00:00',p13,'NEGOTIATING'),
    (o3,op3,'EMAIL','INBOUND','RFP Received – Data Governance','Formal RFP for enterprise-wide data governance programme; response due in 3 weeks','2025-04-01 08:00:00',p14,'ACTION'),
    (p4,op4,'CALL','OUTBOUND','Training Needs Assessment','Sarah outlined training requirements for her team of 12 analysts','2025-01-10 14:00:00',p13,'QUALIFIED'),
    (p4,op4,'EMAIL','OUTBOUND','Training Schedule & Proposal','Sent proposed training calendar and platform access details','2025-01-20 10:30:00',p13,'POSITIVE'),
    (o4,op5,'MEETING','OUTBOUND','Metadata Suite POC Presentation','Demonstrated metadata harvesting from 5 data sources in under 30 minutes','2025-03-18 11:00:00',p15,'IMPRESSED'),
    (p1,NULL,'CALL','INBOUND','Support Query – Dashboard Loading','Ahmed reported intermittent dashboard loading; escalated to L2 support','2025-11-03 10:15:00',p14,'ESCALATED'),
    (p2,NULL,'EMAIL','INBOUND','Feature Request – Bulk Export','Fatima requested CSV bulk export for governance reports','2025-12-10 09:00:00',p14,'LOGGED'),
    (o1,NULL,'CALL','INBOUND','Annual Review Meeting Request','Client requested quarterly business review with executive team','2026-01-05 14:30:00',p15,'SCHEDULED'),
    (p7,op10,'MEETING','OUTBOUND','Consulting Scope Definition','Reviewed 6-month consulting roadmap and agreed deliverables','2026-02-15 10:00:00',p15,'AGREEMENT'),
    (p5,op8,'CALL','OUTBOUND','Platform Trial Feedback','David completed 2-week trial; positive on metadata search; 2 feature gaps to address','2026-03-20 11:30:00',p14,'FOLLOW_UP'),
    (p10,op9,'EMAIL','INBOUND','Support Renewal Invoice Request','Hessa requested early renewal invoice for budget planning','2026-04-01 08:30:00',p14,'ACTIONED'),
    (o5,op6,'MEETING','OUTBOUND','C-Suite Presentation – Data Vision','Presented enterprise data governance case study and ROI model to Arabian Steel leadership','2026-03-10 09:00:00',p15,'POSITIVE'),
    (p9,NULL,'CALL','INBOUND','Partnership Programme Discussion','Tariq explored partner/reseller programme; sent partner information pack','2026-04-15 14:00:00',p13,'FOLLOW_UP'),
    (p3,op7,'EMAIL','OUTBOUND','Re-engagement Campaign Response','Mohammed clicked re-engagement email and viewed platform overview video','2026-01-20 10:00:00',p13,'OPENED');

  -- ── Service Cases ──────────────────────────────────────────────────────────
  INSERT INTO crm.service_case (case_ref,party_id,account_id,case_type,priority_code,status_code,subject,description,channel_code,assigned_to,opened_at,resolved_at,satisfaction_score,resolution_notes) VALUES
    ('CASE-2025-001',p1, a1, 'INQUIRY',   'MEDIUM','RESOLVED',  'Dashboard loading intermittently',             'Main analytics dashboard fails to load after login approximately every 3rd attempt',                   'CALL', p14,'2025-11-02 09:15:00','2025-11-04 14:30:00',4.5,'Caching issue on shared CDN node resolved; edge cache cleared and TTL adjusted'),
    ('CASE-2025-002',o1, ao1,'REQUEST',   'HIGH',  'CLOSED',    'Implementation timeline adjustment request',   'Al-Zubair requested 2-week delay in implementation kickoff due to internal system freeze',               'EMAIL',p15,'2025-02-10 08:00:00','2025-02-12 10:00:00',5.0,'Timeline revised; new kickoff confirmed for March 3rd with updated project plan'),
    ('CASE-2025-003',p4, a4, 'REQUEST',   'LOW',   'CLOSED',    'Training session rescheduling – April',        'Sarah Johnson requested postponement of advanced training from February to April due to team travel',    'EMAIL',p13,'2025-01-25 11:00:00','2025-01-26 09:30:00',5.0,'Training rescheduled to April 7-9; all participants confirmed'),
    ('CASE-2025-004',p2, a2, 'COMPLAINT', 'MEDIUM','RESOLVED',  'Incorrect invoice – VIP rate not applied',     'Invoice showed full list price instead of agreed VIP account rate',                                    'EMAIL',p14,'2025-10-15 10:30:00','2025-10-17 16:00:00',4.0,'Credit note issued; corrected invoice sent with VIP discount applied'),
    ('CASE-2025-005',o2, ao2,'INQUIRY',   'HIGH',  'IN_PROGRESS','API gateway 504 errors under load',            'Emirates Tech reporting intermittent gateway timeout on /metadata/lineage endpoint under heavy concurrent load','PHONE',p13,'2026-04-20 14:00:00',NULL,NULL,NULL),
    ('CASE-2024-006',p3, a3, 'INQUIRY',   'LOW',   'RESOLVED',  'Query on Pro licence seat count',               'Mohammed asked whether Pro licence covers 50 concurrent users or 50 named seats',                       'EMAIL',p14,'2024-11-08 09:00:00','2024-11-08 15:00:00',3.5,'Clarified named-seat model; FAQ document sent'),
    ('CASE-2026-007',p5, a5, 'REQUEST',   'MEDIUM','OPEN',      'Azure AD SSO configuration assistance',         'David Chen requesting help configuring Azure AD SSO; no internal IT support available for integration',  'EMAIL',p14,'2026-04-25 10:00:00',NULL,NULL,NULL),
    ('CASE-2025-008',o3, ao3,'INQUIRY',   'LOW',   'CLOSED',    'Data residency requirements – UAE cloud',       'Gulf Commerce asked about data residency options for UAE-hosted deployment',                             'PHONE',p14,'2025-04-05 11:30:00','2025-04-07 14:00:00',4.5,'UAE data centre availability confirmed; hosting options document shared'),
    ('CASE-2026-009',p11,a11,'FEEDBACK',  'LOW',   'OPEN',      'Arabic UI localisation request',                'Abdullah requested full Arabic RTL support and Arabic language pack as a priority feature',              'EMAIL',p14,'2026-03-15 09:30:00',NULL,NULL,NULL),
    ('CASE-2026-010',p6, a6, 'REQUEST',   'MEDIUM','IN_PROGRESS','Upgrade path enquiry – Standard to Pro',       'Layla asking about upgrade pricing, data migration process, and expected downtime',                      'EMAIL',p13,'2026-04-10 10:00:00',NULL,NULL,NULL);

  -- ── Sales Orders ───────────────────────────────────────────────────────────
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status,notes)
    VALUES ('ORD-2025-001',o1,ao1,op1,'DELIVERED','2025-04-01','2025-04-30','2025-04-25',65000,0,65000,'PAID','Enterprise onboarding package – Al-Zubair Holdings') RETURNING order_id INTO or1;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2025-002',p4,a4,op4,'DELIVERED','2025-04-16','2025-04-23','2025-04-22',13000,0,13000,'PAID') RETURNING order_id INTO or2;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2025-003',p1,a1,NULL,'CONFIRMED','2025-06-01','2025-06-30',NULL,20000,0,20000,'PARTIAL') RETURNING order_id INTO or3;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2025-004',p2,a2,NULL,'DELIVERED','2025-07-10','2025-07-31','2025-07-28',8000,0,8000,'PAID') RETURNING order_id INTO or4;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2026-005',o4,ao4,op5,'PROCESSING','2026-01-15','2026-03-31',NULL,30000,0,30000,'PARTIAL') RETURNING order_id INTO or5;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2024-006',p3,a3,op7,'CANCELLED','2024-11-01','2024-12-15',NULL,20000,0,20000,'REFUNDED') RETURNING order_id INTO or6;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2026-007',o1,ao1,NULL,'CONFIRMED','2026-04-01','2026-04-30',NULL,8000,0,8000,'PAID') RETURNING order_id INTO or7;
  INSERT INTO crm.sales_order (order_ref,party_id,account_id,opportunity_id,order_status,order_date,delivery_date_est,delivery_date_act,subtotal,tax_amount,total_amount,payment_status)
    VALUES ('ORD-2026-008',p10,a10,op9,'DELIVERED','2026-03-01','2026-03-31','2026-03-28',8000,0,8000,'PAID') RETURNING order_id INTO or8;

  INSERT INTO crm.order_line (order_id,product_id,quantity,unit_price,discount_pct,line_total) VALUES
    (or1,pr1,1,50000,0,50000),(or1,pr6,1,15000,0,15000),
    (or2,pr3,1, 8000,0, 8000),(or2,pr8,1, 5000,0, 5000),
    (or3,pr2,1,20000,0,20000),
    (or4,pr9,1, 8000,0, 8000),
    (or5,pr5,1,30000,0,30000),
    (or6,pr2,1,20000,0,20000),
    (or7,pr9,1, 8000,0, 8000),
    (or8,pr9,1, 8000,0, 8000);

  INSERT INTO crm.payment (order_id,payment_method,amount,payment_date,reference_no,status_code) VALUES
    (or1,'BANK_TRANSFER',65000,'2025-04-05','TXN-BT-20250405-AZH001','COMPLETED'),
    (or2,'CARD',         13000,'2025-04-16','TXN-CC-20250416-SJH001','COMPLETED'),
    (or3,'BANK_TRANSFER',10000,'2025-06-05','TXN-BT-20250605-ARM001','COMPLETED'),
    (or4,'CARD',          8000,'2025-07-10','TXN-CC-20250710-FAM001','COMPLETED'),
    (or5,'BANK_TRANSFER',15000,'2026-01-20','TXN-BT-20260120-MCO001','COMPLETED'),
    (or7,'CARD',          8000,'2026-04-03','TXN-CC-20260403-AZH002','COMPLETED'),
    (or8,'CARD',          8000,'2026-03-05','TXN-CC-20260305-HNA001','COMPLETED');

  -- ── Campaigns ──────────────────────────────────────────────────────────────
  INSERT INTO crm.campaign (campaign_code,campaign_name,campaign_type,status_code,start_date,end_date,budget,actual_spend,leads_generated,conversions)
    VALUES ('CAMP_Q1_2025','Q1 2025 Enterprise Data Governance Outreach','EMAIL','COMPLETED','2025-01-06','2025-03-28',25000,18500,45,8) RETURNING campaign_id INTO ca1;
  INSERT INTO crm.campaign (campaign_code,campaign_name,campaign_type,status_code,start_date,end_date,budget,actual_spend,leads_generated,conversions)
    VALUES ('CAMP_WEBINAR_2025','Data Governance Masterclass Webinar Series','WEBINAR','COMPLETED','2025-09-01','2025-11-30',15000,11200,120,22) RETURNING campaign_id INTO ca2;

  INSERT INTO crm.campaign_response (campaign_id,party_id,response_type,responded_at,channel_code,converted) VALUES
    (ca1,o1,'SUBMIT','2025-01-10 11:30:00','EMAIL',true),
    (ca1,o2,'CLICK', '2025-01-12 09:15:00','EMAIL',true),
    (ca1,o3,'OPEN',  '2025-01-11 08:00:00','EMAIL',false),
    (ca1,o4,'SUBMIT','2025-01-15 14:00:00','EMAIL',true),
    (ca1,p4,'SUBMIT','2025-01-14 10:30:00','EMAIL',true),
    (ca1,p7,'CLICK', '2025-01-13 16:00:00','EMAIL',false),
    (ca1,p9,'OPEN',  '2025-01-10 07:30:00','EMAIL',false),
    (ca1,p11,'SUBMIT','2025-01-16 11:00:00','EMAIL',false),
    (ca2,o1,'SUBMIT','2025-09-15 10:00:00','WEB',true),
    (ca2,o2,'SUBMIT','2025-09-16 11:30:00','WEB',true),
    (ca2,o3,'CLICK', '2025-09-20 09:00:00','EMAIL',false),
    (ca2,p1,'SUBMIT','2025-09-18 14:00:00','WEB',false),
    (ca2,p4,'SUBMIT','2025-09-17 10:00:00','WEB',true),
    (ca2,p2,'SUBMIT','2025-09-19 09:30:00','WEB',true),
    (ca2,p10,'SUBMIT','2025-10-01 11:00:00','WEB',false);

  RAISE NOTICE 'CRMDB seed complete: 20 parties · 10 opportunities · 20 interactions · 10 cases · 8 orders · 2 campaigns';
END $$;
