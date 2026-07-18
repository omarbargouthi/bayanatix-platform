-- ═══════════════════════════════════════════════════════════════════════════════
-- 052_dsa_enhancements.sql
-- Enhancements to Data Sharing Agreements:
--   • BIDIRECTIONAL direction code for external agreements
--   • from_department / to_department for internal agreements
--   • dataset_direction (OUTBOUND / INBOUND) + inbound tracking fields
--   • entity_id made nullable (inbound datasets may have no catalog entity yet)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── direction_code: add BIDIRECTIONAL ─────────────────────────────────────────
ALTER TABLE bayanat.data_sharing_agreements
  DROP CONSTRAINT IF EXISTS data_sharing_agreements_direction_code_check;
ALTER TABLE bayanat.data_sharing_agreements
  ADD CONSTRAINT data_sharing_agreements_direction_code_check
  CHECK (direction_code IN ('PROVIDER','REQUESTER','BIDIRECTIONAL'));

-- ── Department fields (INTERNAL agreements) ───────────────────────────────────
ALTER TABLE bayanat.data_sharing_agreements
  ADD COLUMN IF NOT EXISTS from_department_text VARCHAR(255),
  ADD COLUMN IF NOT EXISTS to_department_text   VARCHAR(255);

-- ── dsa_datasets: inbound tracking ───────────────────────────────────────────
ALTER TABLE bayanat.dsa_datasets
  ADD COLUMN IF NOT EXISTS dataset_direction         VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND'
    CHECK (dataset_direction IN ('OUTBOUND','INBOUND')),
  ADD COLUMN IF NOT EXISTS inbound_name_text         VARCHAR(255),   -- manual name for received dataset
  ADD COLUMN IF NOT EXISTS inbound_description_text  TEXT,           -- what we expect to receive
  ADD COLUMN IF NOT EXISTS inbound_source_id         INT
    REFERENCES bayanat.data_sources(data_source_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inbound_entity_id         INT
    REFERENCES bayanat.data_entities(entity_id) ON DELETE SET NULL;  -- assigned when data arrives in catalog

-- Make entity_id nullable so inbound rows can exist before catalog assignment
ALTER TABLE bayanat.dsa_datasets
  ALTER COLUMN entity_id DROP NOT NULL;

-- Replace unique constraint: for OUTBOUND, (dsa_id, entity_id) must be unique
-- (the old unique constraint covered the full table; now we scope it to non-null)
ALTER TABLE bayanat.dsa_datasets
  DROP CONSTRAINT IF EXISTS dsa_datasets_dsa_id_entity_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dsa_datasets_outbound_unique
  ON bayanat.dsa_datasets (dsa_id, entity_id)
  WHERE entity_id IS NOT NULL AND dataset_direction = 'OUTBOUND';
