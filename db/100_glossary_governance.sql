-- Migration 100: Glossary term_type correctness + governance inheritance
-- (Domain -> Sub-domain -> Term) with a DMO-approved override workflow.
-- =====================================================================

-- ── 1. term_type correctness ──────────────────────────────────────────────
-- Every domain/sub-domain currently gets term_type='TERM' (the column
-- default) since app/api/glossary/domains never set it — indistinguishable
-- from a real business term, and getGlossaryTerms()'s only filter
-- (parent_glossary_id IS NOT NULL) means a sub-domain would show up in the
-- flat terms table alongside real terms. Backfill by structural position,
-- then the API starts setting it correctly for new rows going forward.
UPDATE bayanat.business_glossaries SET term_type = 'DOMAIN' WHERE parent_glossary_id IS NULL;

UPDATE bayanat.business_glossaries g SET term_type = 'SUBDOMAIN'
WHERE g.parent_glossary_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM bayanat.business_glossaries c WHERE c.parent_glossary_id = g.glossary_id);

-- ── 2. Governance inheritance resolvers (Domain -> Sub-domain -> Term) ─────
-- Mirrors the asset_stakeholders column->table->schema->source resolver
-- (db/046, db/097), but business_glossaries is self-referential (one table,
-- arbitrary nesting) so this is naturally recursive instead of hardcoded
-- per level. owner_user_id is a single nullable column directly on the row
-- (nullable = inherit); glossary_stewards is a table (empty = inherit).

CREATE OR REPLACE FUNCTION bayanat.fn_resolve_glossary_owner(p_glossary_id INT)
RETURNS TABLE(user_id VARCHAR(255), resolved_from_id INT) LANGUAGE plpgsql AS $$
DECLARE
  v_owner     VARCHAR(255);
  v_parent_id INT;
BEGIN
  SELECT owner_user_id, parent_glossary_id INTO v_owner, v_parent_id
  FROM bayanat.business_glossaries WHERE glossary_id = p_glossary_id;

  IF v_owner IS NOT NULL THEN
    RETURN QUERY SELECT v_owner, p_glossary_id;
    RETURN;
  END IF;

  IF v_parent_id IS NULL THEN RETURN; END IF; -- root domain, nothing above it

  RETURN QUERY SELECT * FROM bayanat.fn_resolve_glossary_owner(v_parent_id);
END;
$$;

CREATE OR REPLACE FUNCTION bayanat.fn_resolve_glossary_stewards(p_glossary_id INT)
RETURNS TABLE(user_id VARCHAR(255), resolved_from_id INT) LANGUAGE plpgsql AS $$
DECLARE
  v_parent_id INT;
  v_has_own   BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM bayanat.glossary_stewards WHERE glossary_id = p_glossary_id) INTO v_has_own;
  IF v_has_own THEN
    RETURN QUERY SELECT gs.user_id, p_glossary_id FROM bayanat.glossary_stewards gs WHERE gs.glossary_id = p_glossary_id;
    RETURN;
  END IF;

  SELECT parent_glossary_id INTO v_parent_id FROM bayanat.business_glossaries WHERE glossary_id = p_glossary_id;
  IF v_parent_id IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT * FROM bayanat.fn_resolve_glossary_stewards(v_parent_id);
END;
$$;

-- ── 3. DMO-approved governance override workflow ──────────────────────────
-- Unlike catalog asset governance (an admin can override directly),
-- overriding a Domain's inherited Owner/Steward at a Sub-domain or Term
-- requires sign-off from the Data Management Office — reuses the existing
-- generic workflow engine (workflow_definitions/workflow_stages/
-- request_type_workflows/asset_requests, lib/workflow.ts) and the "DMO
-- Manager" role already created for the PI Clear-Text Access workflow
-- (db/096) rather than inventing a second head-of-DMO role.

ALTER TABLE bayanat.asset_requests
  DROP CONSTRAINT IF EXISTS asset_requests_request_type_code_check;

ALTER TABLE bayanat.asset_requests
  ADD CONSTRAINT asset_requests_request_type_code_check
  CHECK (request_type_code IN (
    'FIX_DATA_ISSUE', 'UPDATE_DEFINITION', 'CERTIFY_ASSET',
    'GRANT_ACCESS',   'REMOVE_ACCESS',     'OTHER',
    'CLASSIFY_ASSET', 'PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI',
    'COMPLIANCE_REVIEW', 'PI_CLEAR_TEXT_ACCESS', 'OVERRIDE_GLOSSARY_GOVERNANCE'
  ));

-- Proposed change carried alongside the generic asset_requests row — one
-- row per request, holding what governance change is being asked for.
CREATE TABLE IF NOT EXISTS bayanat.glossary_governance_change_requests (
  request_id             INT PRIMARY KEY REFERENCES bayanat.asset_requests(request_id) ON DELETE CASCADE,
  glossary_id            INT NOT NULL REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE,
  proposed_owner_user_id VARCHAR(255) REFERENCES bayanat.users(user_id),
  proposed_steward_ids   TEXT[] NOT NULL DEFAULT '{}',
  justification_text     TEXT
);

INSERT INTO bayanat.workflow_definitions (workflow_name_text, description_text)
SELECT 'Glossary Governance Override Approval',
       'DMO sign-off required to override an inherited Owner/Steward at a Sub-domain or Term level'
WHERE NOT EXISTS (
  SELECT 1 FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Glossary Governance Override Approval'
);

DO $$
DECLARE
  v_wf_id  INT;
  v_dmo_id INT;
BEGIN
  SELECT workflow_id INTO v_wf_id FROM bayanat.workflow_definitions WHERE workflow_name_text = 'Glossary Governance Override Approval';
  SELECT role_id INTO v_dmo_id FROM bayanat.roles WHERE role_name = 'DMO Manager';

  IF v_wf_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bayanat.workflow_stages WHERE workflow_id = v_wf_id) THEN
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text, assignee_type, assignee_role_id, sla_days_count, is_final)
    VALUES
      (v_wf_id, 1, 'DMO Approval', 'Data Management Office reviews and approves the proposed governance override', 'ROLE', v_dmo_id, 3, true);
  END IF;

  INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
  VALUES ('OVERRIDE_GLOSSARY_GOVERNANCE', v_wf_id)
  ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id;
END $$;
