-- Adds KPI_SQL as a routable LLM capability (Admin > AI Providers > Capability
-- Routes), for the new "AI Assist" button on Report KPI Admin's custom-SQL
-- KPI form. Same routing/budget/health-fallback machinery every other
-- capability already uses (lib/enrichment/provider-router.ts) -- this
-- migration only widens the allowed capability_code values.

ALTER TABLE bayanat.llm_capability_routes DROP CONSTRAINT IF EXISTS llm_capability_routes_code_check;
ALTER TABLE bayanat.llm_capability_routes ADD CONSTRAINT llm_capability_routes_code_check
  CHECK (capability_code IN ('DESCRIBE', 'REPHRASE', 'DQ_SEMANTIC', 'CHAT', 'TRANSLATE', 'KPI_SQL'));
