-- Migration 103: Legal Hold driving tables + record-level exclusion conditions
--
-- Completes the previously-stubbed "ENTITY" legal hold scope (the UI let you
-- pick it but had no table picker or condition builder behind it, and no
-- entities/conditions were ever attached). A hold can now name one or more
-- "driving" tables, each with a chosen natural-key column, plus one or more
-- conditions (any column = value) that identify the records under hold.
-- Multiple conditions on the same driving table are OR'd together.
--
-- This is the exclusion-rule DEFINITION layer only. There is no automated
-- retention-purge job anywhere in this schema yet (retention today is
-- table-level status tracking for dashboards, not row-level execution), so
-- nothing currently "consumes" these conditions to skip a real deletion —
-- that would be a separate, much larger feature. This gives the rule a real
-- home plus a live estimated-affected-row count where a source is queryable.

CREATE TABLE IF NOT EXISTS bayanat.legal_hold_entities (
  hold_id          INT NOT NULL REFERENCES bayanat.legal_holds(hold_id) ON DELETE CASCADE,
  entity_id        INT NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  key_attribute_id INT REFERENCES bayanat.data_attributes(attribute_id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hold_id, entity_id)
);

CREATE TABLE IF NOT EXISTS bayanat.legal_hold_conditions (
  condition_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hold_id      INT NOT NULL,
  entity_id    INT NOT NULL,
  attribute_id INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  value_text   TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (hold_id, entity_id) REFERENCES bayanat.legal_hold_entities(hold_id, entity_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_legal_hold_conditions_hold_entity
  ON bayanat.legal_hold_conditions(hold_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_legal_hold_entities_entity
  ON bayanat.legal_hold_entities(entity_id);
