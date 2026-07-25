-- Migration 058: stop silently dropping open dataset columns
-- =====================================================================
-- Bug: two distinct FOI requested attributes that happen to map to the
-- same catalog column collided on the partial unique index added in
-- migration 057, so the FOI -> Open Data bulk insert's
-- "ON CONFLICT DO NOTHING" silently discarded the second column.
-- Each requested attribute / mapping should become its own dataset
-- column regardless of whether it shares a physical source column
-- with another mapping.

DROP INDEX IF EXISTS bayanat.uidx_od_columns_catalog;
