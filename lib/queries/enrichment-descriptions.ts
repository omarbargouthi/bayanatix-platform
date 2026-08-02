// AI Metadata Enrichment — Capability A storage layer (spec §2.3-2.4).
// Suggestions are stored beside official values; only accept() writes description_text.

import { sql } from "../db";
import { logUpdate } from "../audit";
import type { AssetType } from "../enrichment/context";

export type SuggestionStatus = "PENDING" | "ACCEPTED" | "ACCEPTED_EDITED" | "DISCARDED" | "SUPERSEDED";

export type DescriptionSuggestionRow = {
  suggestionId: number;
  assetType: AssetType;
  assetId: number;
  assetName: string;
  entityName: string | null;
  schemaId: number | null;
  modeCode: "GENERATE" | "REPHRASE";
  suggestedText: string;
  variantNumber: number;
  rationale: unknown;
  originalText: string | null;
  currentOfficialText: string | null;
  status: SuggestionStatus;
  acceptedText: string | null;
  jobId: number | null;
  modelRef: string | null;
  createdAt: string;
  drift: boolean;
};

async function currentOfficialText(assetType: AssetType, assetId: number): Promise<string | null> {
  if (assetType === "DATA_ENTITIES") {
    const [row] = await sql<{ text: string | null }[]>`SELECT description_text AS text FROM bayanat.data_entities WHERE entity_id = ${assetId}`;
    return row?.text ?? null;
  }
  const [row] = await sql<{ text: string | null }[]>`SELECT description_text AS text FROM bayanat.data_attributes WHERE attribute_id = ${assetId}`;
  return row?.text ?? null;
}

/**
 * A fresh round of suggestions for an asset supersedes prior PENDING ones (spec
 * §2.3). Callers generating a batch of related suggestions (e.g. the 3 rephrase
 * variants) must call this ONCE before the batch, not once per row — otherwise
 * each new variant would immediately supersede the one generated just before it.
 */
export async function supersedePendingSuggestions(assetType: AssetType, assetId: number, modeCode: "GENERATE" | "REPHRASE"): Promise<void> {
  await sql`
    UPDATE bayanat.description_suggestions SET status_code = 'SUPERSEDED'
    WHERE asset_type_code = ${assetType} AND asset_id = ${assetId} AND status_code = 'PENDING' AND mode_code = ${modeCode}
  `;
}

export async function createDescriptionSuggestion(input: {
  assetType: AssetType; assetId: number; modeCode: "GENERATE" | "REPHRASE";
  suggestedText: string; variantNumber?: number; rationale: unknown; originalText: string | null;
  jobId?: number | null; modelRef: string; contextHash: string; contextManifest: unknown;
}): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.description_suggestions
      (asset_type_code, asset_id, mode_code, suggested_text, variant_number, rationale_json, original_text,
       job_id, model_ref_text, context_hash_text, context_manifest_json)
    VALUES (
      ${input.assetType}, ${input.assetId}, ${input.modeCode}, ${input.suggestedText}, ${input.variantNumber ?? 1},
      ${input.rationale as any}, ${input.originalText},
      ${input.jobId ?? null}, ${input.modelRef}, ${input.contextHash}, ${input.contextManifest as any}
    )
    RETURNING suggestion_id AS id
  `;
  return row.id;
}

export async function getSuggestionsQueue(filter: {
  status?: string; assetType?: AssetType; entityId?: number; jobId?: number; page?: number; limit?: number;
}): Promise<{ rows: DescriptionSuggestionRow[]; total: number }> {
  const { status, assetType, entityId, jobId, page = 1, limit = 50 } = filter;
  const offset = (page - 1) * limit;

  const whereStatus = status ? sql`AND ds.status_code = ${status}` : sql`AND ds.status_code != 'SUPERSEDED'`;
  const whereType = assetType ? sql`AND ds.asset_type_code = ${assetType}` : sql``;
  const whereJob = jobId != null ? sql`AND ds.job_id = ${jobId}` : sql``;
  const whereEntity = entityId != null ? sql`AND (
    (ds.asset_type_code = 'DATA_ENTITIES' AND ds.asset_id = ${entityId})
    OR (ds.asset_type_code = 'DATA_ATTRIBUTES' AND EXISTS (SELECT 1 FROM bayanat.data_attributes a WHERE a.attribute_id = ds.asset_id AND a.entity_id = ${entityId}))
  )` : sql``;

  const rows = await sql<Omit<DescriptionSuggestionRow, "drift" | "currentOfficialText">[]>`
    SELECT
      ds.suggestion_id AS "suggestionId", ds.asset_type_code AS "assetType", ds.asset_id AS "assetId",
      CASE WHEN ds.asset_type_code = 'DATA_ENTITIES' THEN e1.entity_name_text ELSE a.physical_name_text END AS "assetName",
      CASE WHEN ds.asset_type_code = 'DATA_ATTRIBUTES' THEN e2.entity_name_text ELSE NULL END AS "entityName",
      coalesce(s1.schema_id, s2.schema_id) AS "schemaId",
      ds.mode_code AS "modeCode", ds.suggested_text AS "suggestedText", ds.variant_number AS "variantNumber",
      ds.rationale_json AS rationale, ds.original_text AS "originalText",
      ds.status_code AS status, ds.accepted_text AS "acceptedText", ds.job_id AS "jobId",
      ds.model_ref_text AS "modelRef", ds.created_at::text AS "createdAt"
    FROM bayanat.description_suggestions ds
    LEFT JOIN bayanat.data_entities e1 ON ds.asset_type_code = 'DATA_ENTITIES' AND e1.entity_id = ds.asset_id
    LEFT JOIN bayanat.data_schemas s1 ON s1.schema_id = e1.schema_id
    LEFT JOIN bayanat.data_attributes a ON ds.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = ds.asset_id
    LEFT JOIN bayanat.data_entities e2 ON e2.entity_id = a.entity_id
    LEFT JOIN bayanat.data_schemas s2 ON s2.schema_id = e2.schema_id
    WHERE 1=1 ${whereStatus} ${whereType} ${whereJob} ${whereEntity}
    ORDER BY ds.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ cnt }] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt
    FROM bayanat.description_suggestions ds
    LEFT JOIN bayanat.data_attributes a ON ds.asset_type_code = 'DATA_ATTRIBUTES' AND a.attribute_id = ds.asset_id
    WHERE 1=1 ${whereStatus} ${whereType} ${whereJob} ${whereEntity}
  `;

  const withDrift: DescriptionSuggestionRow[] = [];
  for (const r of rows) {
    const official = await currentOfficialText(r.assetType, r.assetId);
    withDrift.push({ ...r, currentOfficialText: official, drift: r.originalText != null && official !== r.originalText });
  }
  return { rows: withDrift, total: cnt };
}

async function applyDescription(assetType: AssetType, assetId: number, text: string, userId: string): Promise<void> {
  if (assetType === "DATA_ENTITIES") {
    const [old] = await sql<{ text: string | null }[]>`SELECT description_text AS text FROM bayanat.data_entities WHERE entity_id = ${assetId}`;
    await sql`UPDATE bayanat.data_entities SET description_text = ${text} WHERE entity_id = ${assetId}`;
    await logUpdate("DATA_ENTITIES", assetId, userId, [{ field: "description_text", oldVal: old?.text ?? null, newVal: text, force: true }]);
  } else {
    const [old] = await sql<{ text: string | null }[]>`SELECT description_text AS text FROM bayanat.data_attributes WHERE attribute_id = ${assetId}`;
    await sql`UPDATE bayanat.data_attributes SET description_text = ${text} WHERE attribute_id = ${assetId}`;
    await logUpdate("DATA_ATTRIBUTES", assetId, userId, [{ field: "description_text", oldVal: old?.text ?? null, newVal: text, force: true }]);
  }
}

export async function acceptDescriptionSuggestion(suggestionId: number, userId: string, finalText?: string): Promise<void> {
  const [row] = await sql<{ assetType: AssetType; assetId: number; suggestedText: string; status: string }[]>`
    SELECT asset_type_code AS "assetType", asset_id AS "assetId", suggested_text AS "suggestedText", status_code AS status
    FROM bayanat.description_suggestions WHERE suggestion_id = ${suggestionId}
  `;
  if (!row) throw new Error("Suggestion not found");
  if (row.status !== "PENDING") throw new Error(`Suggestion is already ${row.status}`);

  const text = (finalText ?? row.suggestedText).trim();
  if (!text) throw new Error("Description text cannot be empty");
  const edited = finalText != null && finalText.trim() !== row.suggestedText.trim();

  await applyDescription(row.assetType, row.assetId, text, userId);
  await sql`
    UPDATE bayanat.description_suggestions SET
      status_code = ${edited ? "ACCEPTED_EDITED" : "ACCEPTED"}, accepted_text = ${text},
      decided_at = NOW(), decided_by_user_id = ${userId}
    WHERE suggestion_id = ${suggestionId}
  `;
}

export async function discardDescriptionSuggestion(suggestionId: number, userId: string): Promise<void> {
  await sql`
    UPDATE bayanat.description_suggestions SET status_code = 'DISCARDED', decided_at = NOW(), decided_by_user_id = ${userId}
    WHERE suggestion_id = ${suggestionId} AND status_code = 'PENDING'
  `;
}

/**
 * Bulk-accepts every PENDING row in the set that hasn't drifted (spec §2.4 — a
 * drifted row must be accepted individually). Returns which ids were accepted vs
 * skipped so the UI can flag the skipped ones for manual review.
 */
export async function bulkAcceptDescriptions(suggestionIds: number[], userId: string): Promise<{ accepted: number[]; skippedDrift: number[] }> {
  const rows = await sql<{ suggestionId: number; assetType: AssetType; assetId: number; suggestedText: string; originalText: string | null; status: string }[]>`
    SELECT suggestion_id AS "suggestionId", asset_type_code AS "assetType", asset_id AS "assetId",
           suggested_text AS "suggestedText", original_text AS "originalText", status_code AS status
    FROM bayanat.description_suggestions WHERE suggestion_id = ANY(${suggestionIds})
  `;
  const accepted: number[] = [];
  const skippedDrift: number[] = [];
  for (const r of rows) {
    if (r.status !== "PENDING") continue;
    const official = await currentOfficialText(r.assetType, r.assetId);
    if (r.originalText != null && official !== r.originalText) { skippedDrift.push(r.suggestionId); continue; }
    await acceptDescriptionSuggestion(r.suggestionId, userId);
    accepted.push(r.suggestionId);
  }
  return { accepted, skippedDrift };
}
