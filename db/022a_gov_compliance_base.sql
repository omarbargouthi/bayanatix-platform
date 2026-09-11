-- Governance base tables that later migrations assume already exist but that never
-- actually appear anywhere in db/*.sql — only referenced via ALTER TABLE / INSERT / the
-- import-*.mjs scripts, or present in the live dev DB, so a from-scratch `npm run
-- db:migrate` run has always failed on the first one it hit ("relation ... does not
-- exist"). Column/constraint shape for all of these is taken from
-- db/bayanatix_backup_2026-05-30.sql's pg_dump of the live schema, so later ADD COLUMN
-- IF NOT EXISTS statements on them become safe no-ops instead of altering a narrower table.
-- Named 022a (not 023) to sort after 022_remove_custodian.sql and before
-- 023_compliance_flow.sql (the earliest consumer, of gov_compliance_frameworks/
-- requirements) without renumbering any existing migration. The registers/framework-docs
-- tables below aren't needed until 040/079/governance_seed.sql respectively, but creating
-- them all up front here is simplest and harmless — nothing between 022 and their first
-- real use depends on them not existing yet.

-- ── Compliance Frameworks feature (NDI, PDPL, DCC, CST, BCBS239, NAII, QAYAS, AI_ETHICS —
-- see scripts/import-*.mjs) — first needed by 023_compliance_flow.sql ──────────────────

CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_frameworks (
    framework_id SERIAL PRIMARY KEY,
    name         text NOT NULL,
    code         text NOT NULL UNIQUE,
    version      text,
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_requirements (
    req_id                  SERIAL PRIMARY KEY,
    framework_id            integer NOT NULL REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
    req_code                text NOT NULL,
    category                text,
    sub_category             text,
    req_text                text NOT NULL,
    guidance                text,
    sort_order               integer NOT NULL DEFAULT 0,
    domain                   text,
    domain_code              text,
    maturity_level           text,
    supporting_evidence      text,
    admission_criteria       text,
    directory_code           text,
    directory_type           text,
    compliance_or_maturity   text,
    operational_excellence   text,
    evident_administrator    text,
    domain_owner             text,
    management_sector        text,
    standard                 text,
    standard_code            text,
    question_en              text,
    supporting_evidence_en   text,
    admission_criteria_en    text,
    management_sector_en     text,
    domain_en                text,
    directory_type_en        text,
    UNIQUE (framework_id, req_code)
);

-- One assessment row per requirement — first needed by 024_compliance_enhancements.sql
CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_assessments (
    assessment_id           SERIAL PRIMARY KEY,
    req_id                  integer NOT NULL UNIQUE REFERENCES bayanat.gov_compliance_requirements(req_id) ON DELETE CASCADE,
    level_code               text NOT NULL DEFAULT 'NOT_ASSESSED',
    notes                    text,
    evidence_name            text,
    evidence_data            bytea,
    assessed_by              text,
    assessed_at              timestamptz DEFAULT now(),
    submission_status        text NOT NULL DEFAULT 'NOT_COMPLETE',
    evident_admin_override   text,
    domain_owner_override    text,
    comments                 text,
    management_notes         text
);

-- ── Governance document library and registers — first needed by 040 (registers),
-- 079 (framework docs), and governance_seed.sql (register data) ───────────────────────

CREATE TABLE IF NOT EXISTS bayanat.gov_framework_docs (
    doc_id          SERIAL PRIMARY KEY,
    section_code    text NOT NULL CHECK (section_code = ANY (ARRAY['POLICY','PROCESS','STRATEGY','ROADMAP','STANDARD','TRAINING','REGULATORY'])),
    title           text NOT NULL,
    description     text,
    status_code     text NOT NULL DEFAULT 'DRAFT' CHECK (status_code = ANY (ARRAY['DRAFT','REVIEW','APPROVED','ARCHIVED'])),
    version_text    text,
    effective_date  date,
    expiry_date     date,
    owner_user_id   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text
);

CREATE TABLE IF NOT EXISTS bayanat.gov_registers (
    register_id  SERIAL PRIMARY KEY,
    name         text NOT NULL,
    description  text,
    is_system    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bayanat.gov_register_columns (
    column_id    SERIAL PRIMARY KEY,
    register_id  integer NOT NULL REFERENCES bayanat.gov_registers(register_id) ON DELETE CASCADE,
    column_name  text NOT NULL,
    column_key   text NOT NULL,
    data_type    text NOT NULL DEFAULT 'TEXT' CHECK (data_type = ANY (ARRAY['TEXT','NUMBER','DATE','SELECT','BOOLEAN','URL','EMAIL'])),
    is_required  boolean NOT NULL DEFAULT false,
    options      jsonb,
    sort_order   integer NOT NULL DEFAULT 0,
    UNIQUE (register_id, column_key)
);
