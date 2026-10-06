-- 153: one "Officer" role per domain.
--
-- "Data Privacy Manager" (manages the Data Privacy domain) and "Data Privacy Officer"
-- (approves PI clear-text requests) are the same job, and so are "Data Governance
-- Compliance" (manages the Data Governance domain) and "Compliance Officer". Each pair
-- becomes one role; the role already used by workflow stages survives so those stages
-- keep pointing at it. The four domain manage roles are then named consistently:
--   Data Privacy Officer, Data Governance Officer, Data Quality Officer,
--   Open Data & Access Officer.
-- Safe to run more than once.

BEGIN;

DO $$
DECLARE
  pair   record;
  keep   int;
  gone   int;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('Data Privacy Officer', 'Data Privacy Manager',       'DATA_PRIVACY', 'Data Privacy'),
      ('Compliance Officer',   'Data Governance Compliance', 'GOVERNANCE',   'Data Governance')
    ) AS v(keep_name, gone_name, domain_code, domain_label)
  LOOP
    SELECT role_id INTO keep FROM bayanat.roles WHERE role_name = pair.keep_name;
    SELECT role_id INTO gone FROM bayanat.roles WHERE role_name = pair.gone_name;
    CONTINUE WHEN keep IS NULL OR gone IS NULL;

    -- The surviving role takes on the domain role's privileges.
    UPDATE bayanat.roles k
    SET domain_write = k.domain_write OR g.domain_write,
        domain_read  = k.domain_read  OR g.domain_read,
        domain_codes = ARRAY[pair.domain_code]
    FROM bayanat.roles g
    WHERE k.role_id = keep AND g.role_id = gone;

    -- Move assignments across, skipping any the surviving role already has.
    DELETE FROM bayanat.role_assignments a
    WHERE a.role_id = gone AND EXISTS (
      SELECT 1 FROM bayanat.role_assignments b
      WHERE b.role_id = keep
        AND b.user_id IS NOT DISTINCT FROM a.user_id AND b.team_id IS NOT DISTINCT FROM a.team_id
        AND b.resource_type = a.resource_type AND b.resource_id IS NOT DISTINCT FROM a.resource_id
    );
    UPDATE bayanat.role_assignments SET role_id = keep WHERE role_id = gone;
    UPDATE bayanat.workflow_stages  SET assignee_role_id = keep WHERE assignee_role_id = gone;
    UPDATE bayanat.auth_settings    SET auto_provision_role_id = keep WHERE auto_provision_role_id = gone;
    DELETE FROM bayanat.roles WHERE role_id = gone;

    -- Whoever already held the surviving role now also manages its domain.
    INSERT INTO bayanat.role_assignments (role_id, user_id, team_id, resource_type, resource_id, resource_name)
    SELECT DISTINCT keep, a.user_id, a.team_id, 'DOMAIN', pair.domain_code, pair.domain_label
    FROM bayanat.role_assignments a
    WHERE a.role_id = keep AND a.resource_type <> 'DOMAIN'
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.role_assignments b
        WHERE b.role_id = keep AND b.resource_type = 'DOMAIN' AND b.resource_id = pair.domain_code
          AND b.user_id IS NOT DISTINCT FROM a.user_id AND b.team_id IS NOT DISTINCT FROM a.team_id
      );
  END LOOP;
END $$;

UPDATE bayanat.roles SET role_name = 'Data Governance Officer'    WHERE role_name = 'Compliance Officer';
UPDATE bayanat.roles SET role_name = 'Data Quality Officer'       WHERE role_name = 'Data Quality';
UPDATE bayanat.roles SET role_name = 'Open Data & Access Officer' WHERE role_name = 'Open Data & Access';

UPDATE bayanat.roles SET description =
  'Manages the Data Privacy domain and approves requests for access to it. Reviews and approves requests to view PI/PII data as clear text.'
WHERE role_name = 'Data Privacy Officer';
UPDATE bayanat.roles SET description =
  'Manages the Data Governance domain (framework, registers, compliance) and approves requests for access to it. Can read and write classification and privacy metadata, and view data for audit purposes.'
WHERE role_name = 'Data Governance Officer';

COMMIT;
