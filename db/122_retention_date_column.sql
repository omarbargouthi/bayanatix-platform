-- Migration 122: Retention date column per table
-- =====================================================================
-- The retention_schedules.trigger_event field (CREATION_DATE, LAST_MODIFIED,
-- ACCOUNT_CLOSURE, ...) has always been a free-text label with no actual
-- column binding — nothing said WHICH column on a given table holds that
-- date. Adds a per-table designation (primarily meaningful on a master
-- table) so the purge configuration manifest can tell an external retention
-- process exactly which column to compare against the schedule's retention
-- period, alongside the existing key/master/cascade fields from migrations
-- 120/121.

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS retention_date_attribute_id INT REFERENCES bayanat.data_attributes(attribute_id) ON DELETE SET NULL;
