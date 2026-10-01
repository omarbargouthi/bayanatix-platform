// AI Assist for Report KPI Admin's custom-SQL KPI form: given a plain-English
// description of what a KPI should calculate, drafts a candidate SELECT query
// grounded in the real Bayanatix schema (table/column/FK metadata, introspected
// live from information_schema -- never hand-maintained, so it can't go stale
// the way a written-out schema doc would). The admin reviews/edits the result
// and still has to run it through the existing Test Query step before saving --
// this never executes anything itself, it only drafts text.
//
// The schema reference is scoped to the KPI's own report domain (R1_MCM, R2_DQ,
// ...) rather than the whole ~180-table bayanat schema: dumping everything would
// blow well past a reasonable prompt size and bury the AI in irrelevant tables
// (job queues, translations, admin config) for every single KPI. The admin
// already picks a report domain in the form, so this reuses that choice rather
// than asking for a second one.

import { sql } from "../db";
import { resolveProviderForCapability } from "../enrichment/provider-router";
import { callProfile } from "../enrichment/llm-adapters";
import { logUsage, getTokensUsedToday } from "../queries/llm-providers";

// Mirrors REPORT_LABELS in app/(app)/admin/reports-kpi/page.tsx. Built from the
// real table names each report's own built-in KPIs already query (lib/reports/
// report-registry.ts and friends), extended with their obvious join companions
// -- not exhaustive, but every table listed is real and genuinely relevant.
const REPORT_DOMAIN_TABLES: Record<string, string[]> = {
  R1_MCM: [
    "data_sources", "data_schemas", "data_entities", "data_attributes", "data_entity_usage", "data_incidents",
    "custom_attribute_definitions", "custom_attribute_values", "custom_asset_types", "custom_assets",
    "custom_asset_links", "custom_asset_type_attributes", "tags", "asset_tags",
    "business_glossaries", "asset_business_terms", "glossary_aliases", "glossary_stewards",
    "asset_certifications", "certification_types", "asset_stakeholders", "stakeholder_roles",
    "entity_groups", "entity_group_members", "connection_registry", "data_categories",
    "business_applications", "application_data_mappings",
  ],
  R2_DQ: [
    "dq_rules", "dq_results", "dq_dimensions", "dq_cde_dimension_config", "dq_attribute_scores",
    "dq_entity_scores", "dq_rule_suggestions", "dq_run_samples", "attribute_profile",
    "attribute_profile_results", "entity_profile", "data_attributes", "data_entities", "data_schemas",
  ],
  R3_DC: [
    "classification_types", "classification_patterns", "classification_runs", "data_attributes",
    "data_entities", "data_categories", "sit_types", "sit_patterns", "business_term_sit_types",
    "npi_category_types", "pi_category_types",
  ],
  R4_DSI: [
    "data_sharing_agreements", "dsa_datasets", "dsa_attributes", "dsa_authorizations",
    "dsa_approvals", "dsa_dataset_dq_issues", "data_entities", "data_attributes",
  ],
  R5_OD: [
    "open_datasets", "open_dataset_columns", "open_dataset_dq_issues", "data_categories", "data_entities",
  ],
  R6_FOI: [
    "foi_requests", "foi_requesters", "foi_requested_attributes", "foi_attribute_mappings",
    "foi_assessments", "foi_communications", "foi_payments", "foi_quotes", "foi_appeals", "foi_rejection_grounds",
  ],
  R7_PDP: [
    "data_attributes", "data_entities", "pi_access_grants", "pi_access_requests", "pi_category_types",
    "npi_category_types", "sit_types", "sit_patterns", "legal_holds", "legal_hold_entities",
    "legal_hold_conditions", "legal_hold_categories", "retention_schedules", "retention_relationships", "data_categories",
  ],
  R8_DG_SUMMARY: [
    "governance_domains", "gov_compliance_frameworks", "gov_compliance_requirements", "gov_compliance_assessments",
    "compliance_maturity_selections", "gov_compliance_domain_config", "compliance_trends", "maturity_trends",
    "data_entities", "data_attributes", "dq_results", "classification_runs", "foi_requests",
    "open_datasets", "data_sharing_agreements", "retention_schedules", "legal_holds",
  ],
  R9_RETENTION: [
    "retention_schedules", "retention_relationships", "legal_holds", "legal_hold_entities",
    "legal_hold_conditions", "legal_hold_categories", "data_entities", "data_categories",
  ],
};

// Shorter aliases purely to keep the prompt compact -- semantically unambiguous.
const TYPE_ALIAS: Record<string, string> = {
  "character varying": "text", "character": "text",
  "timestamp without time zone": "timestamp", "timestamp with time zone": "timestamptz",
  "double precision": "float8",
};
function shortType(t: string): string {
  return TYPE_ALIAS[t] ?? t;
}

async function getSchemaReferenceText(reportCode: string): Promise<string> {
  const tables = REPORT_DOMAIN_TABLES[reportCode] ?? [];
  if (tables.length === 0) return "(no schema reference available for this report domain)";

  const columns = await sql<{ tableName: string; columnName: string; dataType: string }[]>`
    SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType"
    FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = ANY(${tables})
    ORDER BY table_name, ordinal_position
  `;
  const byTable = new Map<string, string[]>();
  for (const c of columns) {
    const list = byTable.get(c.tableName) ?? [];
    list.push(`${c.columnName}:${shortType(c.dataType)}`);
    byTable.set(c.tableName, list);
  }
  const tableLines = tables
    .filter((t) => byTable.has(t))
    .map((t) => `bayanat.${t}(${byTable.get(t)!.join(", ")})`);

  // FK edges where EITHER side is in this domain's table list -- surfaces the
  // join path even to a table just outside the primary list (e.g. a DQ KPI
  // joining dq_results back to data_entities for its name).
  const fks = await sql<{ fromTable: string; fromCol: string; toTable: string; toCol: string }[]>`
    SELECT tc.table_name AS "fromTable", kcu.column_name AS "fromCol",
           ccu.table_name AS "toTable", ccu.column_name AS "toCol"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'bayanat'
      AND (tc.table_name = ANY(${tables}) OR ccu.table_name = ANY(${tables}))
  `;
  const fkLines = fks.map((f) => `${f.fromTable}.${f.fromCol} -> ${f.toTable}.${f.toCol}`);

  return [
    "Tables (name(column:type, ...)):",
    ...tableLines,
    "",
    "Foreign keys:",
    ...(fkLines.length ? fkLines : ["(none found)"]),
  ].join("\n");
}

export type KpiSqlAssistResult = { ok: true; sql: string } | { ok: false; error: string };

export async function generateKpiSql(reportCode: string, description: string): Promise<KpiSqlAssistResult> {
  const schemaRef = await getSchemaReferenceText(reportCode);

  const prompt = [
    "You are a PostgreSQL assistant drafting ONE read-only query for a custom KPI in the Bayanatix data governance platform's Reports module.",
    "",
    "Output contract (strict):",
    "- Exactly one SELECT (or WITH ... SELECT) statement, no trailing semicolon.",
    '- Must return exactly one row with exactly one numeric column aliased as "value". No other columns.',
    "- Use ONLY the tables and columns listed below. Never invent a table or column name that isn't listed.",
    "- The query runs through a read-only role with a 3-second statement timeout -- prefer aggregates over row-by-row logic, avoid unnecessary joins.",
    "- Return ONLY the raw SQL text. No markdown code fences, no explanation, no comments.",
    "",
    schemaRef,
    "",
    `KPI description: ${description}`,
  ].join("\n");

  const resolved = await resolveProviderForCapability("KPI_SQL");
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { profile, apiKey } = resolved;

  if (profile.dailyTokenBudget != null && profile.dailyTokenBudget > 0) {
    const usedToday = await getTokensUsedToday(profile.profileId);
    if (usedToday >= profile.dailyTokenBudget) {
      return { ok: false, error: `Daily token budget exceeded for provider "${profile.profileName}" — queue paused until tomorrow` };
    }
  }

  try {
    const { text, inputTokens, outputTokens } = await callProfile(profile, apiKey, prompt, 500);
    await logUsage(profile.profileId, "KPI_SQL", inputTokens, outputTokens, !!text);
    if (!text) return { ok: false, error: "LLM returned an empty response" };

    const cleaned = text.replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/i, "").trim().replace(/;+\s*$/, "");
    return { ok: true, sql: cleaned };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM call failed";
    await logUsage(profile.profileId, "KPI_SQL", 0, 0, false, message);
    return { ok: false, error: message };
  }
}
