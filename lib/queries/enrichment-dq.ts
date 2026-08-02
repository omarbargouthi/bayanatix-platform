// AI Metadata Enrichment — Capability B storage layer (spec §3.3).
// Suggestions are stored beside dq_rules; only accept() creates a real dq_rules row.

import { sql } from "../db";
import { logCreate } from "../audit";
import { createDqRule } from "./dq";
import { updateDqRule } from "./dq";
import type { AssetType } from "../enrichment/context";
import type { DqRuleDraft } from "../enrichment/dq-suggester";

export type DqSuggestionStatus = "PENDING" | "ACCEPTED" | "ACCEPTED_EDITED" | "DISCARDED" | "DUPLICATE";

export type DqRuleSuggestionRow = {
  suggestionId: number;
  assetType: AssetType;
  assetId: number;
  assetName: string;
  entityName: string | null;
  schemaId: number | null;
  dimensionCode: string | null;
  ruleName: string | null;
  ruleTemplateCode: string | null;
  ruleLogicType: string | null;
  ruleDefinitionText: string | null;
  ruleConfig: unknown;
  thresholdJson: unknown;
  severity: string;
  provenance: string;
  evidence: unknown;
  status: DqSuggestionStatus;
  createdRuleId: number | null;
  jobId: number | null;
  modelRef: string | null;
  createdAt: string;
};

/** Duplicate guard (spec §3.3): an active rule of the same dimension + logic type already targets this asset. */
export async function isDuplicateRule(assetType: AssetType, assetId: number, dimensionCode: string, ruleTemplateCode: string): Promise<boolean> {
  const [row] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt FROM bayanat.dq_rules
    WHERE asset_type_code = ${assetType} AND asset_id = ${assetId} AND is_active_indicator = true
      AND dimension_code = ${dimensionCode}
      AND coalesce(rule_template_code, 'CUSTOM_SQL') = ${ruleTemplateCode}
  `;
  return (row?.cnt ?? 0) > 0;
}

export async function createDqRuleSuggestion(input: {
  assetType: AssetType; assetId: number; draft: DqRuleDraft;
  jobId?: number | null; modelRef: string; contextHash: string; contextManifest: unknown;
}): Promise<number> {
  const { draft } = input;
  const duplicate = await isDuplicateRule(input.assetType, input.assetId, draft.dimensionCode, draft.ruleTemplateCode);

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.dq_rule_suggestions
      (asset_type_code, asset_id, dimension_code, rule_name_text, rule_template_code, rule_logic_type_code,
       rule_definition_text, rule_config_json, threshold_json, severity_level_code, provenance_code, evidence_json,
       status_code, job_id, model_ref_text, context_hash_text, context_manifest_json)
    VALUES (
      ${input.assetType}, ${input.assetId}, ${draft.dimensionCode}, ${draft.ruleNameText}, ${draft.ruleTemplateCode},
      ${draft.ruleLogicTypeCode}, ${draft.ruleDefinitionText}, ${draft.ruleConfig as any},
      ${draft.thresholdJson as any}, ${draft.severityLevelCode}, ${draft.provenanceCode},
      ${draft.evidenceJson as any}, ${duplicate ? "DUPLICATE" : "PENDING"},
      ${input.jobId ?? null}, ${input.modelRef}, ${input.contextHash}, ${input.contextManifest as any}
    )
    RETURNING suggestion_id AS id
  `;
  return row.id;
}

export async function getDqSuggestionsQueue(filter: {
  status?: string; assetType?: AssetType; entityId?: number; jobId?: number; page?: number; limit?: number;
}): Promise<{ rows: DqRuleSuggestionRow[]; total: number }> {
  const { status, assetType, entityId, jobId, page = 1, limit = 50 } = filter;
  const offset = (page - 1) * limit;

  const whereStatus = status ? sql`AND s.status_code = ${status}` : sql``;
  const whereType = assetType ? sql`AND s.asset_type_code = ${assetType}` : sql``;
  const whereJob = jobId != null ? sql`AND s.job_id = ${jobId}` : sql``;
  const whereEntity = entityId != null ? sql`AND (
    (s.asset_type_code = 'DATA_ENTITIES' AND s.asset_id = ${entityId})
    OR (s.asset_type_code = 'DATA_ATTRIBUTES' AND EXISTS (SELECT 1 FROM bayanat.data_attributes a WHERE a.attribute_id = s.asset_id AND a.entity_id = ${entityId}))
  )` : sql``;

  const rows = await sql<DqRuleSuggestionRow[]>`
    SELECT
      s.suggestion_id AS "suggestionId", s.asset_type_code AS "assetType", s.asset_id AS "assetId",
      CASE WHEN s.asset_type_code = 'DATA_ENTITIES' THEN e1.entity_name_text ELSE a.physical_name_text END AS "assetName",
      CASE WHEN s.asset_type_code = 'DATA_ATTRIBUTES' THEN e2.entity_name_text ELSE NULL END AS "entityName",
      coalesce(s1.schema_id, s2.schema_id) AS "schemaId",
      s.dimension_code AS "dimensionCode", s.rule_name_text AS "ruleName", s.rule_template_code AS "ruleTemplateCode",
      s.rule_logic_type_code AS "ruleLogicType", s.rule_definition_text AS "ruleDefinitionText",
      s.rule_config_json AS "ruleConfig", s.threshold_json AS "thresholdJson", s.severity_level_code AS severity,
      s.provenance_code AS provenance, s.evidence_json AS evidence, s.status_code AS status,
      s.created_rule_id AS "createdRuleId", s.job_id AS "jobId", s.model_ref_text AS "modelRef", s.created_at::text AS "createdAt"
    FROM bayanat.dq_rule_suggestions s
    LEFT JOIN bayanat.data_entities e1 ON s.asset_type_code = 'DATA_ENTITIES' AND e1.entity_id = s.asset_id
    LEFT JOIN bayanat.data_schemas s1 ON s1.schema_id = e1.schema_id
    LEFT JOIN bayanat.data_attributes a ON s.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = s.asset_id
    LEFT JOIN bayanat.data_entities e2 ON e2.entity_id = a.entity_id
    LEFT JOIN bayanat.data_schemas s2 ON s2.schema_id = e2.schema_id
    WHERE 1=1 ${whereStatus} ${whereType} ${whereJob} ${whereEntity}
    ORDER BY s.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ cnt }] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt
    FROM bayanat.dq_rule_suggestions s
    LEFT JOIN bayanat.data_attributes a ON s.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = s.asset_id
    WHERE 1=1 ${whereStatus} ${whereType} ${whereJob} ${whereEntity}
  `;
  return { rows, total: cnt };
}

export async function acceptDqRuleSuggestion(
  suggestionId: number, userId: string,
  overrides?: { ruleName?: string; dimensionCode?: string; ruleConfig?: Record<string, unknown>; ruleDefinitionText?: string; severityLevelCode?: string; thresholdWarn?: number; thresholdFail?: number },
): Promise<number> {
  const [row] = await sql<{
    assetType: AssetType; assetId: number; dimensionCode: string | null; ruleName: string | null;
    ruleTemplateCode: string | null; ruleDefinitionText: string | null; ruleConfig: Record<string, unknown>;
    severity: string; provenance: string; status: string;
  }[]>`
    SELECT asset_type_code AS "assetType", asset_id AS "assetId", dimension_code AS "dimensionCode",
           rule_name_text AS "ruleName", rule_template_code AS "ruleTemplateCode", rule_definition_text AS "ruleDefinitionText",
           rule_config_json AS "ruleConfig", severity_level_code AS severity, provenance_code AS provenance, status_code AS status
    FROM bayanat.dq_rule_suggestions WHERE suggestion_id = ${suggestionId}
  `;
  if (!row) throw new Error("Suggestion not found");
  if (row.status === "DUPLICATE") throw new Error("Cannot accept a suggestion marked as a duplicate of an existing active rule");
  if (row.status !== "PENDING") throw new Error(`Suggestion is already ${row.status}`);

  const edited = !!overrides && Object.keys(overrides).length > 0;
  const ruleTemplateCode = row.ruleTemplateCode === "CUSTOM_SQL" ? null : row.ruleTemplateCode;

  const ruleId = await createDqRule({
    ruleName: overrides?.ruleName ?? row.ruleName ?? "AI-suggested rule",
    dimensionCode: overrides?.dimensionCode ?? row.dimensionCode,
    assetTypeCode: row.assetType, assetId: row.assetId,
    ruleTemplateCode, ruleConfig: overrides?.ruleConfig ?? row.ruleConfig ?? {},
    ruleDefinitionText: overrides?.ruleDefinitionText ?? row.ruleDefinitionText ?? "",
    severityLevelCode: overrides?.severityLevelCode ?? row.severity,
    thresholdWarn: overrides?.thresholdWarn ?? null, thresholdFail: overrides?.thresholdFail ?? null,
    scheduleCron: null, notifyOwners: false, openIssueOnFail: false,
  });

  // Spec §3.2: LLM-tier drafts stay inactive until a steward explicitly reviews/activates them.
  if (row.provenance === "LLM") {
    await updateDqRule(ruleId, { isActive: false });
  }

  await logCreate("DQ_RULES", ruleId, userId, [
    { field: "rule_name_text", newVal: overrides?.ruleName ?? row.ruleName ?? null },
    { field: "dimension_code", newVal: overrides?.dimensionCode ?? row.dimensionCode ?? null },
    { field: "source", newVal: `AI suggestion #${suggestionId} (${row.provenance})` },
  ]);

  await sql`
    UPDATE bayanat.dq_rule_suggestions SET
      status_code = ${edited ? "ACCEPTED_EDITED" : "ACCEPTED"}, created_rule_id = ${ruleId},
      decided_at = NOW(), decided_by_user_id = ${userId}
    WHERE suggestion_id = ${suggestionId}
  `;
  return ruleId;
}

export async function discardDqRuleSuggestion(suggestionId: number, userId: string): Promise<void> {
  await sql`
    UPDATE bayanat.dq_rule_suggestions SET status_code = 'DISCARDED', decided_at = NOW(), decided_by_user_id = ${userId}
    WHERE suggestion_id = ${suggestionId} AND status_code IN ('PENDING', 'DUPLICATE')
  `;
}

/** Bulk-accept excludes DUPLICATE rows (spec §3.3 AC6: "not accepted-able by bulk"). */
export async function bulkAcceptDqSuggestions(suggestionIds: number[], userId: string): Promise<{ accepted: number[]; skippedDuplicate: number[] }> {
  const rows = await sql<{ suggestionId: number; status: string }[]>`
    SELECT suggestion_id AS "suggestionId", status_code AS status FROM bayanat.dq_rule_suggestions WHERE suggestion_id = ANY(${suggestionIds})
  `;
  const accepted: number[] = [];
  const skippedDuplicate: number[] = [];
  for (const r of rows) {
    if (r.status === "DUPLICATE") { skippedDuplicate.push(r.suggestionId); continue; }
    if (r.status !== "PENDING") continue;
    await acceptDqRuleSuggestion(r.suggestionId, userId);
    accepted.push(r.suggestionId);
  }
  return { accepted, skippedDuplicate };
}
