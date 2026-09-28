-- Migration 119: Route METADATA_UPDATE through the existing "Metadata Update"
-- workflow instead of a separate single-stage one
-- =====================================================================
-- 118 seeded a brand-new "Metadata Change Review" workflow (single
-- ASSET_STEWARD stage) for rescan-detected schema changes. Per explicit
-- request, rescan changes should instead route through the SAME "Metadata
-- Update" workflow already used by UPDATE_DEFINITION (Draft Update -> Review
-- -> Approve, all ROLE-based; "Draft Update" is assigned to the global
-- "Data Steward" role, so the steward-notification requirement is still met
-- for role holders) — one workflow shared by both request types, not two
-- near-duplicate ones.
--
-- This supersedes 118: drops the workflow it created (idempotent — no-op if
-- 118 never ran, e.g. a fresh DB bootstrap where both files run back to
-- back) and repoints request_type_workflows at "Metadata Update" instead.

DO $$
DECLARE
  v_old_wf_id INT;
  v_target_wf_id INT;
BEGIN
  SELECT workflow_id INTO v_old_wf_id FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Metadata Change Review';
  IF v_old_wf_id IS NOT NULL THEN
    -- Only safe to drop if nothing has actually run through it yet (true on
    -- any real deployment of 118, since it was seeded and immediately
    -- superseded in the same session — see [[project-bayanatix]]).
    IF NOT EXISTS (SELECT 1 FROM bayanat.workflow_instances WHERE workflow_id = v_old_wf_id) THEN
      DELETE FROM bayanat.workflow_stages WHERE workflow_id = v_old_wf_id;
      DELETE FROM bayanat.workflow_definitions WHERE workflow_id = v_old_wf_id;
    END IF;
  END IF;

  SELECT workflow_id INTO v_target_wf_id FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Metadata Update';
  IF v_target_wf_id IS NOT NULL THEN
    INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
    VALUES ('METADATA_UPDATE', v_target_wf_id)
    ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id;
  END IF;
END $$;
