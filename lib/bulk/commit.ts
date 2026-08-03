// Bulk Upload — commit pipeline (spec §3.1 step 4). Applies exactly the plan
// produced by lib/bulk/validate.ts through the SAME service-layer functions the
// catalog UI itself uses (updateDataSource/updateEntity/updateAttribute), so audit
// logging is identical between a manual edit and a bulk-applied one. Rows are
// processed sequentially with progress checkpointed every 1,000 rows rather than
// wrapped in real multi-row SQL transactions — updateEntity/updateAttribute/etc.
// use the module-level `sql` client directly, not an injectable transaction handle,
// and each individual row's own UPDATE statement is already atomic on its own.

import { sql } from "../db";
import { logCreate, logUpdate } from "../audit";
import { updateDataSource, updateEntity, updateAttribute } from "../queries/catalog";
import { supersedePendingSuggestions } from "../queries/enrichment-descriptions";
import type { RowPlan } from "./validate";
import type { SessionUser } from "../types";

export type CommitOptions = {
  session: SessionUser;
  conflictPolicy: "SKIP" | "OVERWRITE";
  overrideRowKeys: Set<string>; // `${sheet}:${rowNumber}` rows the user explicitly chose "overwrite anyway" for
};

export type CommitTotals = { applied: number; created: number; skippedNoop: number; skippedConflict: number; errors: number };

function changeVal(plan: RowPlan, key: string): string | null | undefined {
  const c = plan.changes.find((c) => c.field === key);
  return c ? c.newVal : undefined;
}

async function resolveOrCreateTagIds(names: string[], userId: string): Promise<number[]> {
  if (names.length === 0) return [];
  const existing = await sql<{ tagId: number; tagName: string }[]>`SELECT tag_id AS "tagId", tag_name AS "tagName" FROM bayanat.tags WHERE tag_name = ANY(${names})`;
  const found = new Map(existing.map((t) => [t.tagName.toLowerCase(), t.tagId]));
  const ids: number[] = [];
  for (const name of names) {
    const id = found.get(name.toLowerCase());
    if (id != null) { ids.push(id); continue; }
    const [created] = await sql<{ id: number }[]>`INSERT INTO bayanat.tags (tag_name) VALUES (${name}) RETURNING tag_id AS id`;
    ids.push(created.id);
  }
  return ids;
}

async function applyTags(assetType: string, assetId: number, tagCsv: string, userId: string): Promise<void> {
  const names = tagCsv.split(";").map((s) => s.trim()).filter(Boolean);
  const tagIds = await resolveOrCreateTagIds(names, userId);
  await sql`DELETE FROM bayanat.asset_tags WHERE asset_type_code = ${assetType} AND asset_id = ${assetId}`;
  for (const tagId of tagIds) {
    await sql`
      INSERT INTO bayanat.asset_tags (tag_id, asset_type_code, asset_id, assigned_by)
      VALUES (${tagId}, ${assetType}, ${assetId}, ${userId})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function applyDataSourceRow(plan: RowPlan, userId: string): Promise<void> {
  const [current] = await sql<{ description: string | null; businessAppName: string | null }[]>`
    SELECT description_text AS description, business_app_name AS "businessAppName" FROM bayanat.data_sources WHERE data_source_id = ${plan.assetId}
  `;
  const description = changeVal(plan, "description") ?? current?.description ?? "";
  const businessAppName = changeVal(plan, "businessAppName") ?? current?.businessAppName ?? "";
  await updateDataSource(plan.assetId!, userId, { description: description ?? "", businessAppName: businessAppName ?? "" });
}

async function applyTableRow(plan: RowPlan, userId: string): Promise<void> {
  const [current] = await sql<{ description: string | null; friendlyName: string | null; category: string | null }[]>`
    SELECT description_text AS description, display_name_text AS "friendlyName", entity_category_code AS category
    FROM bayanat.data_entities WHERE entity_id = ${plan.assetId}
  `;
  const description = changeVal(plan, "description") ?? current?.description ?? "";
  const friendlyName = changeVal(plan, "friendlyName") ?? current?.friendlyName ?? "";
  const category = changeVal(plan, "category") ?? current?.category ?? null;
  await updateEntity(plan.assetId!, userId, { description: description ?? "", displayName: friendlyName ?? "", category });

  if (changeVal(plan, "description") !== undefined) {
    await supersedePendingSuggestions("DATA_ENTITIES", plan.assetId!, "GENERATE");
  }
  const tagsChange = changeVal(plan, "tags");
  if (tagsChange !== undefined) await applyTags("DATA_ENTITIES", plan.assetId!, tagsChange ?? "", userId);
}

async function applyColumnRow(plan: RowPlan, userId: string): Promise<void> {
  const [current] = await sql<{ description: string | null; friendlyName: string | null; columnType: string | null; glossaryTerm: string | null; isEncrypted: boolean }[]>`
    SELECT description_text AS description, friendly_name_text AS "friendlyName", attribute_class_code AS "columnType",
           glossary_term_text AS "glossaryTerm", coalesce(is_encrypted, false) AS "isEncrypted"
    FROM bayanat.data_attributes WHERE attribute_id = ${plan.assetId}
  `;
  const description = changeVal(plan, "description") ?? current?.description ?? "";
  const friendlyName = changeVal(plan, "friendlyName") ?? current?.friendlyName ?? "";
  const columnType = changeVal(plan, "columnType") ?? current?.columnType ?? null;
  const glossaryTerm = changeVal(plan, "glossaryTerm") ?? current?.glossaryTerm ?? "";
  const isEncryptedRaw = changeVal(plan, "isEncrypted");
  const isEncrypted = isEncryptedRaw !== undefined ? isEncryptedRaw?.toUpperCase() === "TRUE" : (current?.isEncrypted ?? false);

  await updateAttribute(plan.assetId!, userId, {
    description: description ?? "", friendlyName: friendlyName ?? "", isEncrypted, columnType, glossaryTerm: glossaryTerm ?? "",
  });

  if (changeVal(plan, "description") !== undefined) {
    await supersedePendingSuggestions("DATA_ATTRIBUTES", plan.assetId!, "GENERATE");
  }
  const tagsChange = changeVal(plan, "tags");
  if (tagsChange !== undefined) await applyTags("DATA_ATTRIBUTES", plan.assetId!, tagsChange ?? "", userId);
}

async function applyTermCreate(plan: RowPlan, userId: string): Promise<number> {
  const p = plan.createPayload!;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.business_glossaries
      (term_name_text, parent_glossary_id, definition_text, term_type, classification_code, is_pii_indicator, pi_category_code, format_text, business_rules_text, example_text)
    VALUES (
      ${p.termName as string}, ${p.domainId as number}, ${p.definition as string}, 'TERM',
      ${(p.classification as string) || null}, ${String(p.isPii ?? "").toUpperCase() === "TRUE"}, ${(p.piCategory as string) || null},
      ${(p.format as string) || null}, ${(p.businessRules as string) || null}, ${(p.example as string) || null}
    )
    RETURNING glossary_id AS id
  `;
  await logCreate("BUSINESS_TERMS", row.id, userId, [
    { field: "term_name_text", newVal: p.termName as string },
    { field: "definition_text", newVal: p.definition as string },
  ]);
  return row.id;
}

async function applyTermUpdate(plan: RowPlan, userId: string): Promise<void> {
  const [current] = await sql<Record<string, string | null>[]>`
    SELECT definition_text AS definition, classification_code AS classification, is_pii_indicator AS "isPii",
           pi_category_code AS "piCategory", format_text AS format, business_rules_text AS "businessRules", example_text AS example,
           term_name_text AS "termName"
    FROM bayanat.business_glossaries WHERE glossary_id = ${plan.assetId}
  `;
  const merged = {
    termName: changeVal(plan, "termName") ?? current?.termName ?? "",
    definition: changeVal(plan, "definition") ?? current?.definition ?? "",
    classification: changeVal(plan, "classification") ?? current?.classification ?? null,
    isPii: (changeVal(plan, "isPii") ?? current?.isPii ?? "FALSE"),
    piCategory: changeVal(plan, "piCategory") ?? current?.piCategory ?? null,
    format: changeVal(plan, "format") ?? current?.format ?? null,
    businessRules: changeVal(plan, "businessRules") ?? current?.businessRules ?? null,
    example: changeVal(plan, "example") ?? current?.example ?? null,
  };
  await sql`
    UPDATE bayanat.business_glossaries SET
      term_name_text = ${merged.termName}, definition_text = ${merged.definition}, classification_code = ${merged.classification},
      is_pii_indicator = ${String(merged.isPii).toUpperCase() === "TRUE"}, pi_category_code = ${merged.piCategory},
      format_text = ${merged.format}, business_rules_text = ${merged.businessRules}, example_text = ${merged.example}
    WHERE glossary_id = ${plan.assetId}
  `;
  await logUpdate("BUSINESS_TERMS", plan.assetId!, userId, plan.changes.map((c) => ({ field: c.field, oldVal: c.oldVal, newVal: c.newVal })));
}

export async function commitPlans(jobId: number, plans: RowPlan[], opts: CommitOptions): Promise<CommitTotals> {
  const totals: CommitTotals = { applied: 0, created: 0, skippedNoop: 0, skippedConflict: 0, errors: 0 };

  let processed = 0;
  for (const plan of plans) {
    processed++;
    let outcomeCode: "APPLIED" | "CREATED" | "SKIPPED_NOOP" | "SKIPPED_CONFLICT" | "ERROR";
    let detail: Record<string, unknown>;

    try {
      if (plan.outcome === "ERROR") {
        outcomeCode = "ERROR"; detail = { errors: plan.errors }; totals.errors++;
      } else if (plan.outcome === "SKIPPED_NOOP") {
        outcomeCode = "SKIPPED_NOOP"; detail = {}; totals.skippedNoop++;
      } else if (plan.outcome === "SKIPPED_CONFLICT") {
        const rowKey = `${plan.sheet}:${plan.rowNumber}`;
        const overwrite = opts.conflictPolicy === "OVERWRITE" || opts.overrideRowKeys.has(rowKey);
        if (!overwrite) {
          outcomeCode = "SKIPPED_CONFLICT"; detail = { changes: plan.changes }; totals.skippedConflict++;
        } else {
          await applyRow(plan, opts.session.userId);
          outcomeCode = "APPLIED"; detail = { changes: plan.changes, conflictOverridden: true }; totals.applied++;
        }
      } else if (plan.outcome === "CREATE") {
        const newId = await applyTermCreate(plan, opts.session.userId);
        plan.assetId = newId;
        outcomeCode = "CREATED"; detail = { changes: plan.changes, newId }; totals.created++;
      } else {
        await applyRow(plan, opts.session.userId);
        outcomeCode = "APPLIED"; detail = { changes: plan.changes }; totals.applied++;
      }
    } catch (err) {
      outcomeCode = "ERROR"; detail = { errors: [err instanceof Error ? err.message : "Commit failed"] }; totals.errors++;
    }

    await sql`
      INSERT INTO bayanat.bulk_job_rows (job_id, sheet_name_text, row_number_int, asset_type_code, asset_id, outcome_code, detail_json)
      VALUES (${jobId}, ${plan.sheet}, ${plan.rowNumber}, ${plan.assetType}, ${plan.assetId}, ${outcomeCode}, ${JSON.stringify(detail) as never})
    `;

    if (processed % 1000 === 0) {
      await sql`UPDATE bayanat.bulk_jobs SET totals_json = ${JSON.stringify(totals) as never} WHERE job_id = ${jobId}`;
    }
  }

  return totals;
}

async function applyRow(plan: RowPlan, userId: string): Promise<void> {
  if (plan.sheet === "DataSources") return applyDataSourceRow(plan, userId);
  if (plan.sheet === "Tables") return applyTableRow(plan, userId);
  if (plan.sheet === "Columns") return applyColumnRow(plan, userId);
  if (plan.sheet === "BusinessTerms") return applyTermUpdate(plan, userId);
}
