-- Language Management — foundation pass. Spec: DG Files\Bayanatix - Language
-- Management Feature Spec.md §1-4. Full cutover per approved plan: existing
-- bayanat.ui_translations and bayanat.app_lookups.label_ar data get migrated into
-- this unified schema (ui_translations by scripts/seed-translation-keys.mjs since it
-- needs the key catalog flattened from lib/i18n/en.ts first; app_lookups by the
-- translatable-field registry's sync job, lib/i18n-admin/translatable-fields.ts,
-- since that's the same "sync job picks up existing Arabic as pre-filled
-- translations" path the spec describes for list-value data generally). Both old
-- tables are left in place, just no longer read by app code after this pass —
-- dropping them is a documented fast-follow, not an irreversible action bundled
-- into a first-time cutover migration.

CREATE TABLE IF NOT EXISTS bayanat.languages (
  language_code          varchar(10) PRIMARY KEY,
  language_name_text     varchar(100) NOT NULL,
  orientation_code        varchar(3) NOT NULL DEFAULT 'LTR',
  is_enabled_indicator     bool NOT NULL DEFAULT false,
  is_default_indicator     bool NOT NULL DEFAULT false,
  created_at                timestamp NOT NULL DEFAULT now(),
  updated_at                timestamp NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE bayanat.languages ADD CONSTRAINT languages_orientation_check CHECK (orientation_code IN ('LTR','RTL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bayanat.translation_categories (
  category_code       varchar(50) PRIMARY KEY,
  category_name_text   varchar(100),
  domain_code           varchar(10) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE bayanat.translation_categories ADD CONSTRAINT translation_categories_domain_check CHECK (domain_code IN ('UI','LIST'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bayanat.translation_keys (
  key_id                serial4 PRIMARY KEY,
  category_code          varchar(50) REFERENCES bayanat.translation_categories(category_code),
  key_code                 varchar(200) NOT NULL UNIQUE,
  base_text                 text NOT NULL,
  context_note_text          varchar(255),
  is_active_indicator         bool NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS bayanat.translations (
  translation_id        serial4 PRIMARY KEY,
  key_id                  int4 REFERENCES bayanat.translation_keys(key_id) ON DELETE CASCADE,
  language_code             varchar(10) REFERENCES bayanat.languages(language_code),
  translated_text            text,
  status_code                  varchar(20) NOT NULL DEFAULT 'MISSING',
  model_ref_text                 varchar(100),
  translated_at                    timestamp,
  verified_at                        timestamp,
  verified_by_user_id                  varchar(100),
  CONSTRAINT uq_key_lang UNIQUE (key_id, language_code)
);
DO $$ BEGIN
  ALTER TABLE bayanat.translations ADD CONSTRAINT translations_status_check
    CHECK (status_code IN ('MISSING','AI_TRANSLATED','HUMAN_EDITED','VERIFIED','STALE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_translations_key ON bayanat.translations(key_id);
CREATE INDEX IF NOT EXISTS idx_translations_lang_status ON bayanat.translations(language_code, status_code);

CREATE TABLE IF NOT EXISTS bayanat.translation_protected_terms (
  term_text  varchar(100) PRIMARY KEY
);

-- Cross-device persistence of language choice (AC-3) — the current mechanism is
-- localStorage + a client-set cookie only, which can't follow a user across devices.
DO $$ BEGIN
  ALTER TABLE bayanat.users ADD COLUMN preferred_language_code varchar(10) REFERENCES bayanat.languages(language_code);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Widen the LLM Provider Configuration capability-route CHECK to allow a TRANSLATE
-- route alongside the existing DESCRIBE/REPHRASE/DQ_SEMANTIC/CHAT capabilities.
ALTER TABLE bayanat.llm_capability_routes DROP CONSTRAINT IF EXISTS llm_capability_routes_code_check;
ALTER TABLE bayanat.llm_capability_routes
  ADD CONSTRAINT llm_capability_routes_code_check
  CHECK (capability_code IN ('DESCRIBE','REPHRASE','DQ_SEMANTIC','CHAT','TRANSLATE'));

-- ── Seed languages: the two currently live today (en base, ar as the first
-- language ever added — no special-casing, just already-enabled data) ──
INSERT INTO bayanat.languages (language_code, language_name_text, orientation_code, is_enabled_indicator, is_default_indicator)
VALUES
  ('en', 'English',  'LTR', true, true),
  ('ar', 'العربية',  'RTL', true, false)
ON CONFLICT (language_code) DO NOTHING;

-- ── Seed LIST-domain categories for this pass's representative translatable-field
-- registry entries (lib/i18n-admin/translatable-fields.ts). UI-domain categories are
-- created dynamically by scripts/seed-translation-keys.mjs, one per top-level
-- lib/i18n/strings.ts section, so this migration never needs updating when a new
-- section is added there. ──
INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('LIST_LOOKUPS',        'Reference Lookups',      'LIST'),
  ('LIST_CLASSIFICATION', 'Classification Levels',  'LIST'),
  ('LIST_ROLES',          'Governance Roles',       'LIST')
ON CONFLICT (category_code) DO NOTHING;

-- ── Seed a starter protected-terms list (FR-3.2 / AC-8) — admin-extensible via the
-- Language admin UI, not a fixed code-level list. ──
INSERT INTO bayanat.translation_protected_terms (term_text) VALUES
  ('NDMO'), ('NDI'), ('PDPL'), ('FOI'), ('Bayanatix'), ('DSA'), ('DQ')
ON CONFLICT (term_text) DO NOTHING;
