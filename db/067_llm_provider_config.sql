-- LLM Provider Configuration Feature (Enrichment Backend).
-- See "Bayanatix - LLM Provider Configuration Feature Spec.md" for the full design.
-- Adds a provider-profile layer beneath the SuggestionService (db/066) so the model
-- behind AI Enrichment is a deployment configuration (Managed API / Cloud-hosted
-- in-region / Self-hosted open-weights) instead of a hardcoded Anthropic call.

-- ── 1. llm_credentials — encrypted secrets store (v1: AES-256-GCM, app-level key) ─
-- Profiles never hold a raw key — only a reference (credential_id) into this table.
-- The plaintext key is NEVER written back out once stored (see lib/secrets.ts).

CREATE TABLE IF NOT EXISTS bayanat.llm_credentials (
  credential_id       serial PRIMARY KEY,
  label_text          varchar(150),
  ciphertext_b64       text NOT NULL,
  iv_b64               text NOT NULL,
  auth_tag_b64         text NOT NULL,
  last4_text           varchar(8),
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_at           timestamp,
  created_by_user_id   varchar(100)
);

-- ── 2. llm_provider_profiles ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.llm_provider_profiles (
  profile_id                      serial PRIMARY KEY,
  profile_name_text               varchar(100) NOT NULL,
  provider_type_code              varchar(20) NOT NULL,
  api_flavor_code                 varchar(20) NOT NULL DEFAULT 'OPENAI_COMPAT',
  base_url_text                   varchar(500) NOT NULL,
  model_name_text                 varchar(200) NOT NULL,
  credential_id                   int4 REFERENCES bayanat.llm_credentials(credential_id) ON DELETE SET NULL,
  region_text                     varchar(50),
  max_tokens_int                  int4 NOT NULL DEFAULT 2048,
  temperature_number              numeric(3,2) NOT NULL DEFAULT 0.2,
  timeout_seconds_int             int4 NOT NULL DEFAULT 60,
  daily_token_budget              int8,
  is_enabled_indicator            bool NOT NULL DEFAULT true,
  is_default_indicator            bool NOT NULL DEFAULT false,
  allow_sample_values_indicator   bool NOT NULL DEFAULT false,
  notes_text                      text,
  last_health_status_code         varchar(20) NOT NULL DEFAULT 'UNKNOWN',
  last_health_checked_at          timestamp,
  last_health_message_text        text,
  created_at                      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT llm_provider_profiles_type_check
    CHECK (provider_type_code IN ('MANAGED_API','CLOUD_REGION','SELF_HOSTED')),
  CONSTRAINT llm_provider_profiles_flavor_check
    CHECK (api_flavor_code IN ('OPENAI_COMPAT','ANTHROPIC','BEDROCK','VERTEX')),
  CONSTRAINT llm_provider_profiles_health_check
    CHECK (last_health_status_code IN ('UNKNOWN','HEALTHY','UNHEALTHY'))
);

-- Exactly one default is enforced at the application layer (lib/queries/llm-providers.ts
-- setDefaultProfile, wrapped in a transaction) rather than a partial unique index, since
-- "zero defaults" must also be a valid transient state (e.g. the very first install).
CREATE INDEX IF NOT EXISTS idx_llm_provider_profiles_default ON bayanat.llm_provider_profiles(is_default_indicator) WHERE is_default_indicator;
CREATE INDEX IF NOT EXISTS idx_llm_provider_profiles_enabled ON bayanat.llm_provider_profiles(is_enabled_indicator) WHERE is_enabled_indicator;

-- ── 3. llm_capability_routes — optional per-capability override ────────────────

CREATE TABLE IF NOT EXISTS bayanat.llm_capability_routes (
  route_id              serial PRIMARY KEY,
  capability_code       varchar(30) NOT NULL,
  profile_id            int4 REFERENCES bayanat.llm_provider_profiles(profile_id) ON DELETE SET NULL,
  fallback_profile_id   int4 REFERENCES bayanat.llm_provider_profiles(profile_id) ON DELETE SET NULL,
  CONSTRAINT uq_capability UNIQUE (capability_code),
  CONSTRAINT llm_capability_routes_code_check
    CHECK (capability_code IN ('DESCRIBE','REPHRASE','DQ_SEMANTIC'))
);

-- ── 4. llm_usage_log — per-call token/outcome log, backs the usage dashboard ────

CREATE TABLE IF NOT EXISTS bayanat.llm_usage_log (
  usage_id           serial PRIMARY KEY,
  profile_id         int4 REFERENCES bayanat.llm_provider_profiles(profile_id) ON DELETE CASCADE,
  capability_code    varchar(30) NOT NULL,
  input_tokens       int4 NOT NULL DEFAULT 0,
  output_tokens      int4 NOT NULL DEFAULT 0,
  success_indicator  bool NOT NULL,
  error_text         text,
  logged_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_profile_day ON bayanat.llm_usage_log(profile_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_capability_day ON bayanat.llm_usage_log(capability_code, logged_at);

-- ── 5. enrichment_settings — provider/model/timeout/token-budget/allow-list move
--       to per-profile config (db/066 gave these a single global home; that's now
--       the wrong shape now that there can be multiple profiles). What's left here
--       is genuinely global: DQ-suggestion thresholds, freshness window, batch size,
--       default language.

ALTER TABLE bayanat.enrichment_settings
  DROP COLUMN IF EXISTS provider_code,
  DROP COLUMN IF EXISTS model_ref_text,
  DROP COLUMN IF EXISTS request_timeout_ms,
  DROP COLUMN IF EXISTS daily_token_budget,
  DROP COLUMN IF EXISTS tokens_used_today,
  DROP COLUMN IF EXISTS token_budget_reset_date,
  DROP COLUMN IF EXISTS allowed_endpoints_json;

-- ── 6. Seed: bundled self-hosted default profile (disabled placeholder — see
--       lib/enrichment/README or the session log for why it's not the live default
--       in this environment: no real vLLM endpoint is deployed here yet). The
--       Managed API (Anthropic) profile wrapping the existing ANTHROPIC_API_KEY is
--       seeded separately by scripts/seed-llm-anthropic-profile.mjs, which needs
--       Node crypto + env access that plain SQL doesn't have.

INSERT INTO bayanat.llm_provider_profiles
  (profile_name_text, provider_type_code, api_flavor_code, base_url_text, model_name_text,
   max_tokens_int, temperature_number, timeout_seconds_int, is_enabled_indicator, is_default_indicator,
   allow_sample_values_indicator, notes_text)
SELECT 'Bayanatix Local — Qwen2.5-32B', 'SELF_HOSTED', 'OPENAI_COMPAT', 'http://localhost:8000/v1', 'qwen2.5-32b-instruct',
       2048, 0.2, 60, false, false,
       true, 'Bundled self-hosted default per spec §4 — disabled until pointed at a real vLLM/Ollama endpoint (see deploy/llm-self-hosted/). allow_sample_values=true because data never leaves the network once deployed for real.'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.llm_provider_profiles WHERE profile_name_text = 'Bayanatix Local — Qwen2.5-32B');

INSERT INTO bayanat.llm_provider_profiles
  (profile_name_text, provider_type_code, api_flavor_code, base_url_text, model_name_text,
   max_tokens_int, temperature_number, timeout_seconds_int, is_enabled_indicator, is_default_indicator,
   allow_sample_values_indicator, notes_text)
SELECT 'Bayanatix Local — Qwen2.5-7B (fallback tier)', 'SELF_HOSTED', 'OPENAI_COMPAT', 'http://localhost:8001/v1', 'qwen2.5-7b-instruct',
       2048, 0.2, 60, false, false,
       true, 'Reduced-hardware fallback tier per spec §4 — CPU-only/small-GPU installs. Disabled until deployed.'
WHERE NOT EXISTS (SELECT 1 FROM bayanat.llm_provider_profiles WHERE profile_name_text = 'Bayanatix Local — Qwen2.5-7B (fallback tier)');
