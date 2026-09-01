-- Scheduled/change-detected .pbix folder scanning (lib/lineage/pbix-folder-scan.ts).
-- Per-file last-seen mtime so re-scans skip files that haven't changed since
-- their last successful ingest.
CREATE TABLE IF NOT EXISTS bayanat.lineage_pbix_file_state (
  connection_id   integer NOT NULL REFERENCES bayanat.connection_registry(connection_id) ON DELETE CASCADE,
  file_name       varchar(255) NOT NULL,
  file_mtime      timestamptz NOT NULL,
  last_scanned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, file_name)
);

-- Register the user's real Power BI export folder as a PBIX_FOLDER connection
-- (db_type_code has no CHECK constraint, so this needs no schema change beyond
-- the table above). host_address is the directory path, matching the existing
-- CSV/EXCEL file-source convention of repurposing that column for a filesystem path.
INSERT INTO bayanat.connection_registry (connection_name, db_type_code, host_address, port_number, lineage_enabled)
SELECT 'MCM PowerBI Exports', 'PBIX_FOLDER', 'C:\Omar\20240415\Omar\Personal\Kenzcom\Bayanatix files\PowerBI', 0, true
WHERE NOT EXISTS (SELECT 1 FROM bayanat.connection_registry WHERE db_type_code = 'PBIX_FOLDER');
