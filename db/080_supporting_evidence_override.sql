-- Supporting Evidence was only ever an admin-authored, read-only guidance
-- field on the requirement definition. Mirrors evident_admin_override /
-- domain_owner_override: the assessing user's own text takes precedence
-- over whatever (if anything) the requirement definition pre-fills.
DO $$ BEGIN
  ALTER TABLE bayanat.gov_compliance_assessments ADD COLUMN supporting_evidence_override text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
