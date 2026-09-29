-- Migration 121: Retention master/child relationship registry
-- =====================================================================
-- The category<->table config added in 120 (retention_key_attribute_id,
-- retention_cascade_enabled) said WHICH tables matter and WHICH column
-- identifies a record, but nothing captured HOW a master table's identity
-- actually reaches a child table's rows. Bayanatix hosts this config only —
-- an external retention/purge application executes the actual purge against
-- source systems using it; nothing here runs live DELETE/UPDATE.
--
-- Relationships are discovered by walking the existing FK graph
-- (bayanat.attribute_reference_links, already populated by the crawler's
-- real-FK harvesting and by hand via POST /api/classification/reference-links)
-- but then explicitly registered here so they're editable independently of
-- future re-crawls, scoped per category (the same physical FK can mean
-- something different, or be irrelevant, in a different retention context),
-- and annotated with a free-text join condition for joins that aren't a
-- plain parent_col = child_col.

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS retention_is_master BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS bayanat.retention_relationships (
  relationship_id     SERIAL PRIMARY KEY,
  category_id          INT NOT NULL REFERENCES bayanat.data_categories(category_id) ON DELETE CASCADE,
  parent_entity_id     INT NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  parent_attribute_id  INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  child_entity_id      INT NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  child_attribute_id   INT NOT NULL REFERENCES bayanat.data_attributes(attribute_id) ON DELETE CASCADE,
  join_condition_text  TEXT,
  discovery_method     TEXT NOT NULL DEFAULT 'MANUAL' CHECK (discovery_method IN ('SUGGESTED_FK', 'MANUAL')),
  source_link_id       INT REFERENCES bayanat.attribute_reference_links(link_id) ON DELETE SET NULL,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id   TEXT REFERENCES bayanat.users(user_id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, parent_attribute_id, child_attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_retention_relationships_category ON bayanat.retention_relationships(category_id);
CREATE INDEX IF NOT EXISTS idx_retention_relationships_parent ON bayanat.retention_relationships(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_retention_relationships_child ON bayanat.retention_relationships(child_entity_id);
