-- 198: Removes the Conformity data quality dimension. It overlapped with Validity, no rule
-- template mapped to it, and nothing used it (no rules, rule suggestions, open data or
-- sharing quality issues). Checks agreed standards (code lists, formats) are Validity rules.
-- Safe to run more than once; stops if anything has started using the dimension.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM bayanat.dq_rules               WHERE dimension_code = 'CONFORMITY')
  OR EXISTS (SELECT 1 FROM bayanat.dq_rule_suggestions    WHERE dimension_code = 'CONFORMITY')
  OR EXISTS (SELECT 1 FROM bayanat.open_dataset_dq_issues WHERE dimension_code = 'CONFORMITY')
  OR EXISTS (SELECT 1 FROM bayanat.dsa_dataset_dq_issues  WHERE dimension_code = 'CONFORMITY')
  OR EXISTS (SELECT 1 FROM bayanat.dq_cde_dimension_config WHERE dimension_code = 'CONFORMITY') THEN
    RAISE EXCEPTION 'The Conformity dimension is in use; move those records to another dimension first.';
  END IF;
END $$;

DELETE FROM bayanat.dq_dimensions WHERE dimension_code = 'CONFORMITY';
DELETE FROM bayanat.app_lookups WHERE lookup_group = 'DQ_DIMENSION' AND lookup_code = 'CONFORMITY';
DELETE FROM bayanat.translation_keys
WHERE key_code IN ('dq_dimensions.CONFORMITY.name', 'dq_dimensions.CONFORMITY.description', 'list.app_lookups.DQ_DIMENSION.CONFORMITY');

COMMIT;
