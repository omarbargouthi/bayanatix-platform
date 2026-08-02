// AI Metadata Enrichment — Capability B, Tier 2: LLM-assisted semantic DQ rules
// (spec §3.2). Only invoked for BUSINESS columns — Tier 1 (dq-suggester.ts) never
// depends on this module (NFR-5: LLM outage must not block deterministic rules).

import type { ContextPackage } from "./context";
import type { DqRuleDraft } from "./dq-suggester";
import { runSuggestionPrompt } from "./suggestion-service";

const VALID_DIMENSIONS = new Set(["COMP", "ACCURACY", "CONSISTENCY", "VALIDITY", "FRESHNESS", "CONFORMITY", "UNIQUENESS"]);

type LlmRuleIdea = { rule_name: string; dimension: string; sql: string; rationale: string };

export async function suggestTier2Rules(ctx: ContextPackage): Promise<{ ok: true; drafts: DqRuleDraft[] } | { ok: false; error: string }> {
  const qualifiedTable = ctx.schemaName ? `"${ctx.schemaName}"."${ctx.entityName}"` : `"${ctx.entityName}"`;
  const siblingList = ctx.siblingColumns.map((c) => `${c.name} (${c.dataType})`).join(", ");

  const prompt = [
    `You are a data quality engineer. Given a business column and its sibling columns on the same table, propose up to 2 SEMANTIC data quality rules that a structural/statistical profiler could NOT infer on its own (e.g. cross-column relationships or business-formula checks like "end_date >= start_date" or "vat_amount = 0.15 * net_amount"). Only propose a rule if you are reasonably confident it reflects a real, common-sense business constraint — when in doubt, propose fewer rules or none.`,
    ``,
    `Table: ${qualifiedTable}`,
    `Column under review: ${ctx.physicalName} (${ctx.dataType})`,
    `Sibling columns: ${siblingList || "(none)"}`,
    ctx.glossaryMatch?.businessRulesText ? `Known business rule (glossary): ${ctx.glossaryMatch.businessRulesText}` : "",
    ctx.glossaryMatch?.formatText ? `Expected format (glossary): ${ctx.glossaryMatch.formatText}` : "",
    ``,
    `For each rule, write a PostgreSQL query against ${qualifiedTable} that returns exactly one row with two integer columns named total_rows and failed_rows (failed_rows = rows violating the rule). Use only the columns listed above — never invent column names.`,
    ``,
    `Return ONLY a JSON array (max 2 items) of objects: {"rule_name": string, "dimension": one of ${[...VALID_DIMENSIONS].join("|")}, "sql": string, "rationale": string}. No markdown fences, no other text. Return an empty array [] if no confident semantic rule applies.`,
  ].filter(Boolean).join("\n");

  const result = await runSuggestionPrompt(prompt, ctx, 800);
  if (!result.ok) return result;

  let ideas: LlmRuleIdea[];
  try {
    const jsonText = result.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    ideas = JSON.parse(jsonText);
    if (!Array.isArray(ideas)) throw new Error("not an array");
  } catch {
    return { ok: false, error: "Could not parse Tier 2 rule ideas as JSON" };
  }

  const drafts: DqRuleDraft[] = ideas
    .filter((idea) => idea?.sql && idea?.rule_name)
    .slice(0, 2)
    .map((idea) => ({
      dimensionCode: VALID_DIMENSIONS.has(idea.dimension) ? idea.dimension : "ACCURACY",
      ruleNameText: idea.rule_name,
      ruleTemplateCode: "CUSTOM_SQL",
      ruleConfig: {},
      ruleLogicTypeCode: "SQL_QUERY" as const,
      ruleDefinitionText: idea.sql,
      thresholdJson: {},
      // Spec §3.2: LLM-tier drafts default to INFO severity, inactive until steward review.
      severityLevelCode: "INFO" as const,
      provenanceCode: "LLM" as const,
      evidenceJson: { rationale: idea.rationale, model_ref: result.modelRef },
    }));

  return { ok: true, drafts };
}
