-- Migration 118: Seed the METADATA_UPDATE workflow (rescan steward review)
-- =====================================================================
-- Migration 117 added the METADATA_UPDATE request type and the
-- ASSET_STEWARD assignee type so a rescan's schema changes (new/removed
-- table, added/modified/removed columns) could route to the affected
-- table's steward(s) for review — but never seeded an actual workflow
-- mapped to that request type. lib/crawler.ts's processEntityChanges()
-- silently skips creating the asset_requests row entirely when no
-- workflow is mapped (`if (mapping.length === 0) continue;`), so no
-- request, no workflow_stage_history row, and no notification was ever
-- created for any rescan since 117 shipped — reported live: a steward
-- (khaled) got no notification after a scan added/removed assets.
--
-- Single-stage, steward-only review (not a multi-step approval chain —
-- the crawler already applied the actual change/soft-delete at crawl
-- time; this is purely a review/audit trail, matching the existing
-- comment in lib/workflow.ts's applyApprovalOutcome).

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text)
SELECT 'Metadata Change Review',
       'Routes rescan-detected schema changes (new/removed tables, column adds/type changes/removals) to the affected table''s steward(s) for review'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Metadata Change Review'
);

DO $$
DECLARE
  v_wf_id INT;
BEGIN
  SELECT workflow_id INTO v_wf_id FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Metadata Change Review';

  IF v_wf_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages WHERE workflow_id = v_wf_id) THEN
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text, assignee_type, sla_days_count, is_final)
    VALUES
      (v_wf_id, 1, 'Steward Review', 'Table steward(s) review the detected schema change', 'ASSET_STEWARD', 3, true);
  END IF;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('METADATA_UPDATE', v_wf_id)
  ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id;
END $$;
