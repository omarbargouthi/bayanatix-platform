-- 207: Personal data breach register (lib/privacy/breach.ts).
-- Every suspected or confirmed breach of personal data is recorded here, as PDPL
-- (Implementing Regulation, art. 24) and GDPR (art. 33(5)) require, whether or not it is
-- reported: what happened, the affected catalog assets and the personal data in them,
-- the risk to the people concerned, the 72-hour notification to the regulator, the
-- notice to those people, and the measures taken. The BREACH_WATCH scheduled area
-- (hourly) reminds the handlers before and after the regulator deadline.
-- Safe to run more than once.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS bayanat.breach_reference_seq;

CREATE TABLE IF NOT EXISTS bayanat.privacy_breaches (
  breach_id                   serial PRIMARY KEY,
  reference_code              varchar(30)  NOT NULL UNIQUE,          -- BR-2026-0001
  title_text                  varchar(255) NOT NULL,
  description_text            text,
  status_code                 varchar(20)  NOT NULL DEFAULT 'REPORTED' CHECK (status_code IN
                                ('REPORTED', 'INVESTIGATING', 'CONTAINED', 'CLOSED', 'NOT_A_BREACH')),
  -- When the organisation became aware: the regulator deadline runs from here.
  discovered_at               timestamptz  NOT NULL,
  occurred_from_at            timestamptz,
  occurred_to_at              timestamptz,
  how_discovered_text         text,
  breach_types                text[]       NOT NULL DEFAULT '{}',   -- CONFIDENTIALITY / INTEGRITY / AVAILABILITY
  cause_code                  varchar(30),
  regulations                 text[]       NOT NULL DEFAULT '{PDPL}',
  subjects_estimate_int       integer CHECK (subjects_estimate_int >= 0),
  records_estimate_int        integer CHECK (records_estimate_int >= 0),
  -- Risk to the people concerned: UNLIKELY (no notification needed, reason recorded),
  -- RISK (notify the regulator), HIGH (also notify the people). NULL = not assessed yet,
  -- treated as RISK for the deadline.
  risk_level_code             varchar(10) CHECK (risk_level_code IN ('UNLIKELY', 'RISK', 'HIGH')),
  risk_reason_text            text,
  consequences_text           text,
  containment_text            text,
  prevention_text             text,
  contained_at                timestamptz,
  authority_name_text         varchar(255),
  authority_notified_at       timestamptz,
  authority_reference_text    varchar(255),
  authority_late_reason_text  text,
  subjects_notified_at        timestamptz,
  subjects_method_text        text,
  subjects_notified_int       integer CHECK (subjects_notified_int >= 0),
  subjects_exemption_text     text,
  closed_at                   timestamptz,
  closure_note_text           text,
  owner_user_id               varchar(100) REFERENCES bayanat.users(user_id),
  reported_by_user_id         varchar(100) NOT NULL REFERENCES bayanat.users(user_id),
  facts_json                  jsonb,
  facts_at                    timestamptz,
  due_reminded_at             timestamptz,
  overdue_reminded_at         timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_breaches_status_idx ON bayanat.privacy_breaches (status_code);

CREATE TABLE IF NOT EXISTS bayanat.privacy_breach_assets (
  breach_id         integer      NOT NULL REFERENCES bayanat.privacy_breaches(breach_id) ON DELETE CASCADE,
  asset_type_code   varchar(50)  NOT NULL,
  asset_id          integer      NOT NULL,
  added_by_user_id  varchar(100) REFERENCES bayanat.users(user_id),
  added_at          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (breach_id, asset_type_code, asset_id)
);

CREATE TABLE IF NOT EXISTS bayanat.privacy_breach_events (
  event_id    serial PRIMARY KEY,
  breach_id   integer      NOT NULL REFERENCES bayanat.privacy_breaches(breach_id) ON DELETE CASCADE,
  event_code  varchar(30)  NOT NULL,
  note_text   text,
  user_id     varchar(100),
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_breach_events_breach_idx ON bayanat.privacy_breach_events (breach_id, created_at);

INSERT INTO bayanat.scheduled_job_areas (area_code, schedule_cron) VALUES ('BREACH_WATCH', '0 * * * *')
ON CONFLICT (area_code) DO NOTHING;

-- Not readable by the reporting sandbox, like the other privacy records.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayanatix_kpi_readonly') THEN
    EXECUTE 'REVOKE ALL ON bayanat.privacy_breaches, bayanat.privacy_breach_assets, bayanat.privacy_breach_events FROM bayanatix_kpi_readonly';
  END IF;
END $$;

COMMIT;
