-- 019: source_description_text on entities/attributes, prev_row_count on entity_profile

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS source_description_text TEXT;

ALTER TABLE bayanat.data_attributes
  ADD COLUMN IF NOT EXISTS source_description_text TEXT;

ALTER TABLE bayanat.entity_profile
  ADD COLUMN IF NOT EXISTS prev_row_count BIGINT;

COMMENT ON COLUMN bayanat.data_entities.source_description_text   IS 'Auto-populated from source system comments (COMMENT ON TABLE, TABLE_COMMENT, MS_Description, etc.) during crawl. Read-only — overwritten on each crawl.';
COMMENT ON COLUMN bayanat.data_attributes.source_description_text IS 'Auto-populated from source system column comments during crawl. Read-only — overwritten on each crawl.';
COMMENT ON COLUMN bayanat.entity_profile.prev_row_count           IS 'row_count_estimate value captured from the previous crawl run, used to show % change in the profiling panel.';
