-- Workflow stage assignees used to be a hardcoded semantic enum (STEWARD/
-- OWNER/OFFICER/ADMIN/REQUESTER/SPECIFIC_USER) that didn't correspond to the
-- real Roles defined under User Management, and had no way to assign a stage
-- to a Team. Replaced with an explicit assignee_type + assignee_role_id /
-- assignee_team_id / assignee_user_id, matching how bayanat.role_assignments
-- already models "a Role or Team, resolved to its members" elsewhere in the
-- app. REQUESTER is kept as its own type since it isn't a role at all — it
-- always means "whoever raised this particular request".

ALTER TABLE bayanat.workflow_stages
  ADD COLUMN IF NOT EXISTS assignee_type VARCHAR(20) NOT NULL DEFAULT 'ROLE'
    CHECK (assignee_type IN ('ROLE','TEAM','USER','REQUESTER')),
  ADD COLUMN IF NOT EXISTS assignee_role_id INTEGER REFERENCES bayanat.roles(role_id),
  ADD COLUMN IF NOT EXISTS assignee_team_id INTEGER REFERENCES bayanat.teams(team_id);

-- One-time best-effort migration of existing stages' old semantic codes onto
-- the closest real role, so already-configured workflows keep working rather
-- than silently losing their assignee.
UPDATE bayanat.workflow_stages ws SET assignee_type = 'ROLE', assignee_role_id = r.role_id
FROM bayanat.roles r WHERE ws.required_role_code = 'STEWARD' AND r.role_name = 'Data Steward';

UPDATE bayanat.workflow_stages ws SET assignee_type = 'ROLE', assignee_role_id = r.role_id
FROM bayanat.roles r WHERE ws.required_role_code = 'OFFICER' AND r.role_name = 'Compliance Officer';

UPDATE bayanat.workflow_stages ws SET assignee_type = 'ROLE', assignee_role_id = r.role_id
FROM bayanat.roles r WHERE ws.required_role_code = 'ADMIN' AND r.role_name = 'Platform Admin';

UPDATE bayanat.workflow_stages ws SET assignee_type = 'ROLE', assignee_role_id = r.role_id
FROM bayanat.roles r WHERE ws.required_role_code = 'OWNER' AND r.role_name = 'Data Owner';

UPDATE bayanat.workflow_stages SET assignee_type = 'REQUESTER' WHERE required_role_code = 'REQUESTER';
UPDATE bayanat.workflow_stages SET assignee_type = 'USER'      WHERE required_role_code = 'SPECIFIC_USER';

-- required_role_code is fully superseded by assignee_type/assignee_role_id/assignee_team_id.
ALTER TABLE bayanat.workflow_stages DROP COLUMN IF EXISTS required_role_code;

-- Compliance Officer previously had no GLOBAL role_assignments row (only a
-- DATA_SOURCE-scoped one for mohammed.nasser) — workflow stages only resolve
-- GLOBAL-scoped assignments (per-resource stage scoping was explicitly out of
-- scope), so add the missing global assignment to preserve today's demo
-- behavior (mohammed.nasser previously matched via the legacy users.role='OFFICER' fallback).
INSERT INTO bayanat.role_assignments (role_id, user_id, resource_type, resource_name)
SELECT r.role_id, 'mohammed.nasser', 'GLOBAL', 'Global'
FROM bayanat.roles r
WHERE r.role_name = 'Compliance Officer'
  AND NOT EXISTS (
    SELECT 1 FROM bayanat.role_assignments ra
    WHERE ra.role_id = r.role_id AND ra.user_id = 'mohammed.nasser' AND ra.resource_type = 'GLOBAL'
  );
