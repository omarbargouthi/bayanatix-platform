-- Migration 050: Remove the DATASET_CATEGORY entries from app_lookups.
-- Open Data now uses data_categories (with parent/child) as its category
-- source, matching Privacy and Retention. The flat DATASET_CATEGORY group
-- in app_lookups is no longer used.

DELETE FROM bayanat.app_lookups WHERE lookup_group = 'DATASET_CATEGORY';
