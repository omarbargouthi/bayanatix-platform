-- Comprehensive lineage-scanner regression fixture, registered under the "party"
-- data source (crmdb, crm schema). One procedure exercising every lineage
-- extraction scenario the scanner supports today, plus a few deliberately
-- unhandled constructs (CTE-sourced columns, correlated subqueries, MERGE,
-- dynamic SQL) so the scanner's "must not crash, degrade gracefully" behavior
-- has a permanent, re-runnable test case as the scanner gains capability.

-- ── Target tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.party_360_lineage_test (
  party_id                integer PRIMARY KEY,
  party_type              text,
  is_active_flag          boolean,
  source_system           text,
  first_name              text,
  last_name               text,
  full_name               text,
  org_name                text,
  org_size_bucket         text,
  annual_revenue_numeric  numeric(14,2),
  interaction_count       integer,
  avg_sentiment           numeric,
  last_updated            timestamptz
);

CREATE TABLE IF NOT EXISTS crm.segment_lineage_star_test (LIKE crm.segment INCLUDING DEFAULTS);

-- ── Test procedure ───────────────────────────────────────────────────────────

CREATE OR REPLACE PROCEDURE crm.sp_lineage_scenarios_demo()
LANGUAGE plpgsql
AS $proc$
DECLARE
  v_target_schema text := 'crm';
  v_target_table  text := 'party_360_lineage_test';
BEGIN
  -- Reset the fixture so this procedure is safely re-runnable.
  DELETE FROM crm.party_360_lineage_test;

  -- Scenario 1: DIRECT copy + FILTER (WHERE clause on the source).
  INSERT INTO crm.party_360_lineage_test (party_id, party_type, is_active_flag, source_system)
  SELECT party_id, party_type, is_active, source_system
  FROM crm.party
  WHERE is_active = true;

  -- Scenario 2: CTE + EXPRESSION (string concatenation) applied via UPDATE ... FROM.
  -- The scanner doesn't resolve CTE-sourced columns back to a real catalog table (v1
  -- limitation) — this is the fixture case for that gap.
  WITH person_names AS (
    SELECT party_id, first_name, last_name, first_name || ' ' || last_name AS full_name
    FROM crm.person
  )
  UPDATE crm.party_360_lineage_test t
  SET first_name = pn.first_name,
      last_name  = pn.last_name,
      full_name  = pn.full_name
  FROM person_names pn
  WHERE t.party_id = pn.party_id;

  -- Scenario 3: JOIN + CAST + AGGREGATION (correlated scalar subqueries), via
  -- INSERT ... SELECT ... ON CONFLICT DO UPDATE (upsert on the same fixture rows).
  INSERT INTO crm.party_360_lineage_test (party_id, org_name, org_size_bucket, annual_revenue_numeric, interaction_count, avg_sentiment)
  SELECT
    p.party_id,
    o.org_name,
    o.org_size_code,
    CAST(o.annual_revenue AS numeric(14,2)),
    (SELECT COUNT(*) FROM crm.interaction WHERE interaction.party_id = p.party_id),
    (SELECT AVG(sentiment_score) FROM crm.interaction WHERE interaction.party_id = p.party_id)
  FROM crm.party p
  JOIN crm.organization o ON o.party_id = p.party_id
  ON CONFLICT (party_id) DO UPDATE SET
    org_name               = EXCLUDED.org_name,
    org_size_bucket         = EXCLUDED.org_size_bucket,
    annual_revenue_numeric  = EXCLUDED.annual_revenue_numeric,
    interaction_count       = EXCLUDED.interaction_count,
    avg_sentiment           = EXCLUDED.avg_sentiment;

  -- Scenario 4: MERGE (PG15+) — forward-looking; the scanner has no MergeStmt
  -- branch yet, so this must be skipped gracefully (no lineage extracted, no crash).
  MERGE INTO crm.party_360_lineage_test t
  USING crm.party p ON t.party_id = p.party_id
  WHEN MATCHED THEN
    UPDATE SET is_active_flag = p.is_active
  WHEN NOT MATCHED THEN
    INSERT (party_id, party_type, is_active_flag, source_system)
    VALUES (p.party_id, p.party_type, p.is_active, p.source_system);

  -- Scenario 5: dynamic SQL — must be skipped with a scan warning, never parsed.
  EXECUTE format('UPDATE %I.%I SET last_updated = now() WHERE is_active_flag = true', v_target_schema, v_target_table);

  -- Scenario 6: SELECT * star-expansion (fully supported — expands against the
  -- source table's known catalog columns).
  DELETE FROM crm.segment_lineage_star_test;
  INSERT INTO crm.segment_lineage_star_test
  SELECT * FROM crm.segment;
END;
$proc$;

-- Sanity-run once so the fixture is populated and the procedure body is
-- confirmed executable (independent of whether the scanner can parse it).
CALL crm.sp_lineage_scenarios_demo();
