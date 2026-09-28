-- Migration 120: Category<->table associations, retention mechanism config,
-- and operator/AND-OR aware legal hold conditions
-- =====================================================================
-- Three gaps closed here (see [[project-bayanatix]] for full context):
--
-- 1. data_entities.retention_category_id (migration 039) has never had a
--    write path anywhere in the app — categories.entityCount and the
--    Overview tab's "classified" stat have always read 0 real assignments.
--    Adds the two per-table fields the UI needs alongside it: which column
--    identifies a record (for a future delete/scramble job) and whether
--    related tables should cascade (descriptive/config flag only — there is
--    still no automated purge job in this schema, per migration 103).
--
-- 2. retention_schedules gets a place to record automation details for a
--    SCRAMBLE (or any other) post_retention_action — post_retention_action
--    itself stays unconstrained TEXT, matching this table's existing
--    convention (retention_unit, trigger_event, etc. are all
--    comment-documented, not CHECK-constrained).
--
-- 3. legal_hold_conditions (migration 103) only ever supported
--    `column = value`, OR'd. operator/value_text_2/logic_operator let a
--    condition use a type-appropriate comparison (BETWEEN, GREATER_THAN,
--    CONTAINS, ...) and combine with the previous condition via AND or OR.
--    These three DO get CHECK constraints (unlike post_retention_action)
--    because they directly drive SQL generation in
--    lib/sample-data.ts's estimateAffectedRowCount — must be a closed,
--    whitelisted set.

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS retention_key_attribute_id INT REFERENCES bayanat.data_attributes(attribute_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retention_cascade_enabled  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bayanat.retention_schedules
  ADD COLUMN IF NOT EXISTS automation_config_json JSONB;

ALTER TABLE bayanat.legal_hold_conditions
  ADD COLUMN IF NOT EXISTS operator      TEXT NOT NULL DEFAULT 'EQUALS',
  ADD COLUMN IF NOT EXISTS value_text_2  TEXT,
  ADD COLUMN IF NOT EXISTS logic_operator TEXT NOT NULL DEFAULT 'OR';

ALTER TABLE bayanat.legal_hold_conditions DROP CONSTRAINT IF EXISTS legal_hold_conditions_operator_check;
ALTER TABLE bayanat.legal_hold_conditions ADD CONSTRAINT legal_hold_conditions_operator_check
  CHECK (operator IN (
    'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_OR_EQUAL',
    'LESS_THAN', 'LESS_OR_EQUAL', 'BETWEEN', 'CONTAINS', 'IN_LIST',
    'IS_NULL', 'IS_NOT_NULL'
  ));

ALTER TABLE bayanat.legal_hold_conditions DROP CONSTRAINT IF EXISTS legal_hold_conditions_logic_operator_check;
ALTER TABLE bayanat.legal_hold_conditions ADD CONSTRAINT legal_hold_conditions_logic_operator_check
  CHECK (logic_operator IN ('AND', 'OR'));
