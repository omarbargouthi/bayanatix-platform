-- AI Metadata Enrichment Feature (Description Suggestion + DQ Rule Suggestion).
-- See "Bayanatix - AI Metadata Enrichment Feature Spec.md" for the full design.
-- Same suggest -> edit -> accept contract as the Column Asset-Type feature (db/065):
-- suggestions are stored beside official values with provenance/rationale, and only
-- explicit steward acceptance writes to description_text / creates a dq_rules row.

-- ── 1. enrichment_jobs / enrichment_job_logs — generic bulk-job pattern ────────
-- Mirrors bayanat.crawl_jobs / crawl_job_logs (see lib/queries/crawl-jobs.ts), but
-- generic across both enrichment capabilities via job_type_code.

CREATE TABLE IF NOT EXISTS bayanat.enrichment_jobs (
  job_id                serial PRIMARY KEY,
  job_type_code         varchar(20) NOT NULL,
  status_code           varchar(20) NOT NULL DEFAULT 'RUNNING',
  scope_json            jsonb,
  triggered_by_user_id  varchar(100),
  started_at            timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at           timestamp,
  total_count           int4 NOT NULL DEFAULT 0,
  succeeded_count       int4 NOT NULL DEFAULT 0,
  failed_count          int4 NOT NULL DEFAULT 0,
  error_text            text,
  CONSTRAINT enrichment_jobs_type_check
    CHECK (job_type_code IN ('DESCRIPTION','DQ_RULE')),
  CONSTRAINT enrichment_jobs_status_check
    CHECK (status_code IN ('RUNNING','COMPLETED','FAILED'))
);

CREATE TABLE IF NOT EXISTS bayanat.enrichment_job_logs (
  log_id     serial PRIMARY KEY,
  job_id     int4 NOT NULL REFERENCES bayanat.enrichment_jobs(job_id) ON DELETE CASCADE,
  logged_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  level      varchar(10) NOT NULL DEFAULT 'INFO',
  message    text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enrichment_job_logs_job ON bayanat.enrichment_job_logs(job_id, logged_at);

-- ── 2. description_suggestions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.description_suggestions (
  suggestion_id          serial PRIMARY KEY,
  asset_type_code        varchar(50) NOT NULL,
  asset_id               int4 NOT NULL,
  mode_code              varchar(20) NOT NULL,
  suggested_text         text NOT NULL,
  variant_number         int2 DEFAULT 1,
  rationale_json         jsonb,
  original_text          text,
  status_code            varchar(20) NOT NULL DEFAULT 'PENDING',
  accepted_text          text,
  job_id                 int4 REFERENCES bayanat.enrichment_jobs(job_id) ON DELETE SET NULL,
  model_ref_text         varchar(100),
  context_hash_text      varchar(64),
  context_manifest_json  jsonb,
  created_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at             timestamp,
  decided_by_user_id     varchar(100),
  CONSTRAINT description_suggestions_asset_type_check
    CHECK (asset_type_code IN ('DATA_ENTITIES','DATA_ATTRIBUTES')),
  CONSTRAINT description_suggestions_mode_check
    CHECK (mode_code IN ('GENERATE','REPHRASE')),
  CONSTRAINT description_suggestions_status_check
    CHECK (status_code IN ('PENDING','ACCEPTED','ACCEPTED_EDITED','DISCARDED','SUPERSEDED'))
);

CREATE INDEX IF NOT EXISTS idx_desc_suggestions_asset ON bayanat.description_suggestions(asset_type_code, asset_id);
CREATE INDEX IF NOT EXISTS idx_desc_suggestions_status ON bayanat.description_suggestions(status_code);
CREATE INDEX IF NOT EXISTS idx_desc_suggestions_job ON bayanat.description_suggestions(job_id);

-- ── 3. dq_rule_suggestions ───────────────────────────────────────────────────────
-- rule_template_code + rule_config_json mirror bayanat.dq_rules exactly (see
-- lib/dq-templates.ts) so accepting a suggestion is a direct pass-through into the
-- same execution engine (lib/dq-engine.ts) manually-created rules already use.
-- threshold_json keeps the spec's human-readable evidence shape
-- ({"metric","operator","value","buffer"}) separate from the executable config.

CREATE TABLE IF NOT EXISTS bayanat.dq_rule_suggestions (
  suggestion_id          serial PRIMARY KEY,
  asset_type_code        varchar(50) NOT NULL,
  asset_id               int4 NOT NULL,
  dimension_code         varchar(20) REFERENCES bayanat.dq_dimensions(dimension_code),
  rule_name_text         varchar(150),
  rule_template_code     varchar(40),
  rule_logic_type_code   varchar(20),
  rule_definition_text   text,
  rule_config_json       jsonb,
  threshold_json         jsonb,
  severity_level_code    varchar(20) NOT NULL DEFAULT 'WARNING',
  provenance_code        varchar(20) NOT NULL,
  evidence_json          jsonb,
  status_code            varchar(20) NOT NULL DEFAULT 'PENDING',
  created_rule_id        int4 REFERENCES bayanat.dq_rules(rule_id) ON DELETE SET NULL,
  job_id                 int4 REFERENCES bayanat.enrichment_jobs(job_id) ON DELETE SET NULL,
  model_ref_text         varchar(100),
  context_hash_text      varchar(64),
  context_manifest_json  jsonb,
  created_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at             timestamp,
  decided_by_user_id     varchar(100),
  CONSTRAINT dq_rule_suggestions_asset_type_check
    CHECK (asset_type_code IN ('DATA_ENTITIES','DATA_ATTRIBUTES')),
  CONSTRAINT dq_rule_suggestions_logic_type_check
    CHECK (rule_logic_type_code IN ('SQL_QUERY','REGEX','THRESHOLD')),
  CONSTRAINT dq_rule_suggestions_severity_check
    CHECK (severity_level_code IN ('INFO','WARNING','CRITICAL')),
  CONSTRAINT dq_rule_suggestions_provenance_check
    CHECK (provenance_code IN ('PROFILING','STRUCTURE','GLOSSARY','LLM')),
  CONSTRAINT dq_rule_suggestions_status_check
    CHECK (status_code IN ('PENDING','ACCEPTED','ACCEPTED_EDITED','DISCARDED','DUPLICATE'))
);

CREATE INDEX IF NOT EXISTS idx_dq_rule_suggestions_asset ON bayanat.dq_rule_suggestions(asset_type_code, asset_id);
CREATE INDEX IF NOT EXISTS idx_dq_rule_suggestions_status ON bayanat.dq_rule_suggestions(status_code);
CREATE INDEX IF NOT EXISTS idx_dq_rule_suggestions_job ON bayanat.dq_rule_suggestions(job_id);

-- ── 4. enrichment_settings — singleton config row ───────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.enrichment_settings (
  settings_id              int4 PRIMARY KEY DEFAULT 1,
  provider_code            varchar(20) NOT NULL DEFAULT 'ANTHROPIC',
  model_ref_text           varchar(100) NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  request_timeout_ms       int4 NOT NULL DEFAULT 30000,
  batch_size               int4 NOT NULL DEFAULT 5,
  null_check_buffer_pct    numeric(5,2) NOT NULL DEFAULT 0.50,
  null_check_soft_threshold_pct numeric(5,2) NOT NULL DEFAULT 2.00,
  uniqueness_buffer_pct    numeric(5,2) NOT NULL DEFAULT 0.50,
  profile_freshness_days   int4 NOT NULL DEFAULT 90,
  daily_token_budget       int4 NOT NULL DEFAULT 0,
  tokens_used_today        int4 NOT NULL DEFAULT 0,
  token_budget_reset_date  date DEFAULT CURRENT_DATE,
  default_language_code    varchar(5) NOT NULL DEFAULT 'en',
  allowed_endpoints_json   jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT enrichment_settings_single_row CHECK (settings_id = 1)
);

INSERT INTO bayanat.enrichment_settings (settings_id) VALUES (1) ON CONFLICT (settings_id) DO NOTHING;
