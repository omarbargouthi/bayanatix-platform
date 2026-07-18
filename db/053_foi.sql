-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 053: Freedom of Information (FOI) feature
-- ─────────────────────────────────────────────────────────────────────────────

-- ── KSA holiday calendar (weekends = Fri Sat; Fri = DOW 5, Sat = DOW 6) ──────
CREATE TABLE IF NOT EXISTS bayanat.ksa_holidays (
  holiday_date      DATE         PRIMARY KEY,
  holiday_name_text VARCHAR(200) NOT NULL
);

INSERT INTO bayanat.ksa_holidays (holiday_date, holiday_name_text) VALUES
  ('2026-02-22', 'Founding Day'),
  ('2026-03-20', 'Eid Al-Fitr Day 1'),
  ('2026-03-21', 'Eid Al-Fitr Day 2'),
  ('2026-03-22', 'Eid Al-Fitr Day 3'),
  ('2026-05-27', 'Eid Al-Adha Day 1'),
  ('2026-05-28', 'Eid Al-Adha Day 2'),
  ('2026-05-29', 'Eid Al-Adha Day 3'),
  ('2026-06-01', 'Eid Al-Adha Day 4'),
  ('2026-09-23', 'National Day'),
  ('2027-02-22', 'Founding Day'),
  ('2027-09-23', 'National Day')
ON CONFLICT DO NOTHING;

-- Add business-day count starting the day after start_date up to and including end_date
CREATE OR REPLACE FUNCTION bayanat.ksa_business_days(p_start DATE, p_end DATE)
RETURNS INT LANGUAGE plpgsql STABLE AS $$
DECLARE d DATE := p_start + 1; cnt INT := 0;
BEGIN
  WHILE d <= p_end LOOP
    IF EXTRACT(DOW FROM d) NOT IN (5,6)
       AND NOT EXISTS (SELECT 1 FROM bayanat.ksa_holidays WHERE holiday_date = d)
    THEN cnt := cnt + 1; END IF;
    d := d + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

-- Returns the date that is N business days after p_start
CREATE OR REPLACE FUNCTION bayanat.ksa_add_business_days(p_start DATE, p_days INT)
RETURNS DATE LANGUAGE plpgsql STABLE AS $$
DECLARE d DATE := p_start; cnt INT := 0;
BEGIN
  WHILE cnt < p_days LOOP
    d := d + 1;
    IF EXTRACT(DOW FROM d) NOT IN (5,6)
       AND NOT EXISTS (SELECT 1 FROM bayanat.ksa_holidays WHERE holiday_date = d)
    THEN cnt := cnt + 1; END IF;
  END LOOP;
  RETURN d;
END;
$$;

-- ── FOI config (reuses system_config table) ───────────────────────────────────
INSERT INTO bayanat.system_config (key, value) VALUES
  ('foi_daily_rate_sar',      '2000'),
  ('foi_sla_business_days',   '30'),
  ('foi_appeal_window_days',  '10'),
  ('foi_review_fee_sar',      '500'),
  ('foi_quote_validity_days', '30')
ON CONFLICT (key) DO NOTHING;

-- ── Rejection grounds ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_rejection_grounds (
  ground_code             VARCHAR(50)  PRIMARY KEY,
  ground_name_text        VARCHAR(255) NOT NULL,
  ground_description_text TEXT,
  is_active               BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO bayanat.foi_rejection_grounds (ground_code, ground_name_text, ground_description_text) VALUES
  ('NATIONAL_SECURITY',         'National Security or Interests',             'Information whose disclosure could harm national security, military affairs, or foreign relations.'),
  ('PRE_ISSUANCE_DELIBERATION', 'Pre-Issuance Legislative Deliberations',      'Internal deliberations and drafts prior to official publication of laws, decisions, or policies.'),
  ('COMMERCIAL_HARM',           'Unlawful Commercial Advantage',              'Trade secrets or proprietary commercial information that would cause unlawful competitive harm.'),
  ('IP_RESEARCH',               'Intellectual Property / Research',           'Ongoing research, scientific studies, or IP-protected work not yet published.'),
  ('TENDERS_BIDS',              'Tenders, Bids, or Auctions',                 'Information related to live or recent procurement, bids, or auction processes.'),
  ('PERSONAL_DATA',             'Personal Data Protected Under PDPL',         'Information constituting personal data under the Personal Data Protection Law.'),
  ('OTHER_LAW',                 'Prohibited by Other Applicable Law',         'Disclosure is prohibited by a specific applicable statute other than those listed above.')
ON CONFLICT (ground_code) DO NOTHING;

-- ── Reference code sequence ───────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS bayanat.foi_reference_seq START 1;

-- ── Requesters ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_requesters (
  requester_id             SERIAL4      PRIMARY KEY,
  requester_type_code      VARCHAR(20)  NOT NULL DEFAULT 'INDIVIDUAL'
    CHECK (requester_type_code IN ('INDIVIDUAL','ORGANIZATION')),
  full_name_text           VARCHAR(255) NOT NULL,
  national_id_or_cr_text   VARCHAR(50),
  email_text               VARCHAR(255) NOT NULL,
  phone_text               VARCHAR(50),
  preferred_language_code  VARCHAR(10)  NOT NULL DEFAULT 'ar',
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Main FOI requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_requests (
  foi_request_id            SERIAL4      PRIMARY KEY,
  reference_code            VARCHAR(50)  NOT NULL UNIQUE,
  access_token              CHAR(64)     NOT NULL UNIQUE,
  requester_id              INT          NOT NULL REFERENCES bayanat.foi_requesters(requester_id),
  channel_code              VARCHAR(20)  NOT NULL DEFAULT 'PORTAL'
    CHECK (channel_code IN ('PORTAL','EMAIL','IN_PERSON','GOV_PLATFORM')),
  subject_text              VARCHAR(255) NOT NULL,
  description_text          TEXT         NOT NULL,
  domain_code               VARCHAR(40)  REFERENCES bayanat.governance_domains(domain_code),
  requested_format_code     VARCHAR(20)  NOT NULL DEFAULT 'PDF'
    CHECK (requested_format_code IN ('PDF','XLSX','CSV','JSON','PAPER')),
  status_code               VARCHAR(50)  NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status_code IN (
      'SUBMITTED','TRIAGE','CLARIFICATION_REQUESTED',
      'ASSESSMENT','QUOTED','QUOTE_ACCEPTED',
      'IN_FULFILLMENT','AWAITING_PAYMENT',
      'DELIVERED','CLOSED',
      'REJECTED','APPEAL_OPEN','APPEAL_DECIDED',
      'QUOTE_DECLINED','WITHDRAWN'
    )),
  fulfillment_stage_code    VARCHAR(50)
    CHECK (fulfillment_stage_code IN (
      'OWNER_IDENTIFICATION','OWNER_SCOPE_REVIEW',
      'STEWARD_COORDINATION','TECHNICAL_COMPILATION',
      'OWNER_PACKAGE_APPROVAL','DMO_RELEASE_APPROVAL',
      'PAYMENT_CONFIRMATION','DELIVERY'
    )),
  assigned_officer_user_id  VARCHAR(64)  REFERENCES bayanat.users(user_id),
  rejection_ground_code     VARCHAR(50)  REFERENCES bayanat.foi_rejection_grounds(ground_code),
  rejection_justification_text TEXT,
  delivery_reference        VARCHAR(255),
  submitted_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  first_response_due_date   DATE,
  clock_paused_since        TIMESTAMPTZ,
  clock_paused_days         INT4         NOT NULL DEFAULT 0,
  closed_at                 TIMESTAMPTZ,
  created_by                VARCHAR(64)  REFERENCES bayanat.users(user_id),
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-generate reference_code, access_token, first_response_due_date on INSERT
CREATE OR REPLACE FUNCTION bayanat.foi_request_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  yr  TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  seq INT;
BEGIN
  SELECT NEXTVAL('bayanat.foi_reference_seq') INTO seq;
  NEW.reference_code        := 'FOI-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
  NEW.access_token          := REPLACE(gen_random_uuid()::TEXT, '-', '') ||
                               REPLACE(gen_random_uuid()::TEXT, '-', '');
  NEW.first_response_due_date := bayanat.ksa_add_business_days(
    NEW.submitted_at::DATE,
    (SELECT value::INT FROM bayanat.system_config WHERE key = 'foi_sla_business_days')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER foi_request_before_insert
  BEFORE INSERT ON bayanat.foi_requests
  FOR EACH ROW EXECUTE FUNCTION bayanat.foi_request_on_insert();

-- ── Assessments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_assessments (
  assessment_id             SERIAL4      PRIMARY KEY,
  foi_request_id            INT          NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  eligibility_code          VARCHAR(20)  NOT NULL DEFAULT 'ELIGIBLE'
    CHECK (eligibility_code IN ('ELIGIBLE','ALREADY_PUBLIC','PROTECTED','PARTIAL')),
  complexity_code           VARCHAR(20)  NOT NULL DEFAULT 'MEDIUM'
    CHECK (complexity_code IN ('SIMPLE','MEDIUM','COMPLEX')),
  estimated_columns_count   INT4,
  estimated_sources_count   INT4,
  estimated_effort_days     NUMERIC(5,1) NOT NULL DEFAULT 1,
  involved_entities_json    JSONB,
  already_public_link_text  TEXT,
  notes_text                TEXT,
  assessed_by_user_id       VARCHAR(64)  REFERENCES bayanat.users(user_id),
  assessed_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one active assessment per request
CREATE UNIQUE INDEX IF NOT EXISTS idx_foi_assessments_request
  ON bayanat.foi_assessments(foi_request_id);

-- ── Quotes ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_quotes (
  quote_id                  SERIAL4      PRIMARY KEY,
  foi_request_id            INT          NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  assessment_id             INT          NOT NULL REFERENCES bayanat.foi_assessments(assessment_id),
  daily_rate_sar            NUMERIC(10,2) NOT NULL,
  quoted_amount             NUMERIC(10,2) NOT NULL,
  breakdown_json            JSONB        NOT NULL,
  estimated_delivery_days   INT4         NOT NULL,
  valid_until_date          DATE         NOT NULL,
  status_code               VARCHAR(20)  NOT NULL DEFAULT 'ISSUED'
    CHECK (status_code IN ('ISSUED','ACCEPTED','DECLINED','EXPIRED')),
  decision_at               TIMESTAMPTZ,
  acceptance_evidence_ref   VARCHAR(255),
  issued_by_user_id         VARCHAR(64)  REFERENCES bayanat.users(user_id),
  issued_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_payments (
  payment_id                SERIAL4      PRIMARY KEY,
  foi_request_id            INT          NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  quote_id                  INT          REFERENCES bayanat.foi_quotes(quote_id),
  payment_type_code         VARCHAR(30)  NOT NULL DEFAULT 'FULFILLMENT_FEE'
    CHECK (payment_type_code IN ('FULFILLMENT_FEE','APPEAL_REVIEW_FEE','REFUND')),
  amount                    NUMERIC(10,2) NOT NULL,
  payment_reference_text    VARCHAR(100),
  received_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revenue_account_code      VARCHAR(50)  NOT NULL DEFAULT 'DATA_REVENUE',
  notes_text                TEXT,
  recorded_by_user_id       VARCHAR(64)  REFERENCES bayanat.users(user_id)
);

-- ── Appeals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_appeals (
  appeal_id                 SERIAL4      PRIMARY KEY,
  foi_request_id            INT          NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  submitted_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  grounds_text              TEXT         NOT NULL,
  review_fee_amount         NUMERIC(10,2),
  committee_members_json    JSONB,
  decision_code             VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
    CHECK (decision_code IN ('PENDING','UPHELD','REJECTED_FINAL')),
  decision_justification_text TEXT,
  decided_at                TIMESTAMPTZ,
  is_within_window          BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ── Communications log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.foi_communications (
  comm_id                   SERIAL4      PRIMARY KEY,
  foi_request_id            INT          NOT NULL REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE CASCADE,
  direction_code            VARCHAR(10)  NOT NULL CHECK (direction_code IN ('OUTBOUND','INBOUND')),
  message_type_code         VARCHAR(30)  NOT NULL
    CHECK (message_type_code IN (
      'ACK','CLARIFICATION_REQUEST','QUOTE','STATUS_UPDATE',
      'REJECTION','APPEAL_DECISION','DELIVERY','NOTE'
    )),
  subject_text              VARCHAR(255),
  body_text                 TEXT         NOT NULL,
  sent_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  channel_code              VARCHAR(20)  NOT NULL DEFAULT 'EMAIL'
    CHECK (channel_code IN ('EMAIL','PORTAL','SMS','IN_PERSON')),
  sent_by_user_id           VARCHAR(64)  REFERENCES bayanat.users(user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_foi_requests_status    ON bayanat.foi_requests(status_code);
CREATE INDEX IF NOT EXISTS idx_foi_requests_officer   ON bayanat.foi_requests(assigned_officer_user_id);
CREATE INDEX IF NOT EXISTS idx_foi_requests_submitted ON bayanat.foi_requests(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_foi_comms_request      ON bayanat.foi_communications(foi_request_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_foi_payments_request   ON bayanat.foi_payments(foi_request_id);
