-- Lineage scan configuration per connection: lets an admin choose which
-- object types (views, materialized views, procedures, functions) should
-- be scanned for lineage when a connection's lineage scan is triggered.

ALTER TABLE bayanat.connection_registry
  ADD COLUMN IF NOT EXISTS lineage_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineage_scan_views       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineage_scan_matviews    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineage_scan_procedures  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lineage_scan_functions   boolean NOT NULL DEFAULT true;
