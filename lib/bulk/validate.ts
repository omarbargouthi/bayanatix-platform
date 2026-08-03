// Bulk Upload — row validation pipeline (spec §3.1 step 2). Pure read + compute:
// resolves what WOULD happen for every row (update/create/skip/error) without
// mutating anything. lib/bulk/commit.ts applies exactly this plan.

import { sql } from "../db";
import { canEditAsset, canEditMetadata } from "../can";
import { getFieldsForSheet, CLEAR_SENTINEL, SHEET_ASSET_TYPE, type SheetName, type FieldDef } from "./sheets";
import { loadEnumValues } from "./enum-sources";
import type { ParsedRow, ParsedWorkbook } from "./workbook-reader";
import type { SessionUser } from "../types";

export type FieldChange = { field: string; header: string; oldVal: string | null; newVal: string | null };
export type RowOutcome = "UPDATE" | "CREATE" | "SKIPPED_NOOP" | "SKIPPED_CONFLICT" | "ERROR";

export type RowPlan = {
  sheet: SheetName;
  rowNumber: number;
  assetType: string;
  assetId: number | null;
  isCreate: boolean;
  outcome: RowOutcome;
  changes: FieldChange[];
  errors: string[];
  warnings: string[];
  createPayload?: Record<string, unknown>;
  newTagNames?: string[];
};

export type ValidateOptions = {
  session: SessionUser;
  strictMode: boolean;
  exportSnapshotAt: Date | null;
};

function resolveNewValue(cellRaw: string, oldVal: string | null, strictMode: boolean): { newVal: string | null; touched: boolean } {
  const trimmed = cellRaw.trim();
  if (trimmed === CLEAR_SENTINEL) return { newVal: null, touched: oldVal != null && oldVal !== "" };
  if (trimmed === "") {
    if (strictMode) return { newVal: null, touched: oldVal != null && oldVal !== "" };
    return { newVal: oldVal, touched: false }; // update-only default: blank = no change
  }
  return { newVal: trimmed, touched: trimmed !== (oldVal ?? "") };
}

async function resolveTagIds(tagCellRaw: string, canCreateTags: boolean): Promise<{ tagIds: number[]; newTagNames: string[]; error: string | null }> {
  const names = tagCellRaw.split(";").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return { tagIds: [], newTagNames: [], error: null };
  const existing = await sql<{ tagId: number; tagName: string }[]>`SELECT tag_id AS "tagId", tag_name AS "tagName" FROM bayanat.tags`;
  const byName = new Map(existing.map((t) => [t.tagName.toLowerCase(), t.tagId]));
  const tagIds: number[] = [];
  const newTagNames: string[] = [];
  for (const name of names) {
    const id = byName.get(name.toLowerCase());
    if (id != null) { tagIds.push(id); continue; }
    if (!canCreateTags) return { tagIds: [], newTagNames: [], error: `Unknown tag "${name}" and you don't have permission to create new tags` };
    newTagNames.push(name);
  }
  return { tagIds, newTagNames, error: null };
}

async function wasModifiedSince(assetType: string, assetId: number, since: Date | null): Promise<boolean> {
  if (!since) return false;
  const [row] = await sql<{ latest: string | null }[]>`
    SELECT max(action_timestamp)::text AS latest FROM bayanat.audit_logs WHERE asset_type_code = ${assetType} AND asset_id = ${assetId}
  `;
  if (!row?.latest) return false;
  return new Date(row.latest).getTime() > since.getTime();
}

// ── Per-sheet current-row fetchers (batched) ────────────────────────────────────

async function fetchCurrentDataSources(ids: number[]): Promise<Map<number, Record<string, string | null>>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: number; description: string | null; businessAppName: string | null }[]>`
    SELECT data_source_id AS id, description_text AS description, business_app_name AS "businessAppName"
    FROM bayanat.data_sources WHERE data_source_id = ANY(${ids})
  `;
  return new Map(rows.map((r) => [r.id, { description: r.description, businessAppName: r.businessAppName }]));
}

async function fetchCurrentTables(ids: number[]): Promise<Map<number, Record<string, string | null>>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: number; friendlyName: string | null; description: string | null; category: string | null; tags: string | null }[]>`
    SELECT e.entity_id AS id, e.display_name_text AS "friendlyName", e.description_text AS description, e.entity_category_code AS category,
      coalesce((SELECT string_agg(t.tag_name, '; ' ORDER BY t.tag_name) FROM bayanat.asset_tags at2 JOIN bayanat.tags t ON t.tag_id = at2.tag_id
                WHERE at2.asset_type_code = 'DATA_ENTITIES' AND at2.asset_id = e.entity_id), '') AS tags
    FROM bayanat.data_entities e WHERE e.entity_id = ANY(${ids})
  `;
  return new Map(rows.map((r) => [r.id, { friendlyName: r.friendlyName, description: r.description, category: r.category, tags: r.tags }]));
}

async function fetchCurrentColumns(ids: number[]): Promise<Map<number, Record<string, string | null>>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: number; friendlyName: string | null; description: string | null; columnType: string | null; glossaryTerm: string | null; isEncrypted: boolean; tags: string | null }[]>`
    SELECT a.attribute_id AS id, a.friendly_name_text AS "friendlyName", a.description_text AS description,
      a.attribute_class_code AS "columnType", a.glossary_term_text AS "glossaryTerm", coalesce(a.is_encrypted, false) AS "isEncrypted",
      coalesce((SELECT string_agg(t.tag_name, '; ' ORDER BY t.tag_name) FROM bayanat.asset_tags at2 JOIN bayanat.tags t ON t.tag_id = at2.tag_id
                WHERE at2.asset_type_code = 'DATA_ATTRIBUTES' AND at2.asset_id = a.attribute_id), '') AS tags
    FROM bayanat.data_attributes a WHERE a.attribute_id = ANY(${ids})
  `;
  return new Map(rows.map((r) => [r.id, {
    friendlyName: r.friendlyName, description: r.description, columnType: r.columnType,
    glossaryTerm: r.glossaryTerm, isEncrypted: r.isEncrypted ? "TRUE" : "FALSE", tags: r.tags,
  }]));
}

async function fetchCurrentTerms(ids: number[]): Promise<Map<number, Record<string, string | null>>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{
    id: number; termName: string | null; domainName: string | null; definition: string | null; classification: string | null;
    isPii: boolean; piCategory: string | null; format: string | null; businessRules: string | null; example: string | null;
  }[]>`
    SELECT bg.glossary_id AS id, bg.term_name_text AS "termName", parent.term_name_text AS "domainName", bg.definition_text AS definition,
      bg.classification_code AS classification, coalesce(bg.is_pii_indicator, false) AS "isPii", bg.pi_category_code AS "piCategory",
      bg.format_text AS format, bg.business_rules_text AS "businessRules", bg.example_text AS example
    FROM bayanat.business_glossaries bg LEFT JOIN bayanat.business_glossaries parent ON parent.glossary_id = bg.parent_glossary_id
    WHERE bg.glossary_id = ANY(${ids})
  `;
  return new Map(rows.map((r) => [r.id, {
    termName: r.termName, domainName: r.domainName, definition: r.definition, classification: r.classification,
    isPii: r.isPii ? "TRUE" : "FALSE", piCategory: r.piCategory, format: r.format, businessRules: r.businessRules, example: r.example,
  }]));
}

function toNum(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
}

// ── Field-level validation (enums, length caps) ─────────────────────────────────

async function validateFieldValue(field: FieldDef, newVal: string | null, errors: string[]): Promise<void> {
  if (newVal == null) return;
  if (field.maxLength && newVal.length > field.maxLength) {
    errors.push(`${field.header}: exceeds maximum length of ${field.maxLength} characters`);
  }
  if (field.type === "ENUM" && field.enumSource) {
    const valid = await loadEnumValues(field.enumSource);
    if (!valid.includes(newVal)) errors.push(`${field.header}: "${newVal}" is not a valid value (expected one of ${valid.join(", ")})`);
  }
  if (field.type === "BOOLEAN" && !["TRUE", "FALSE"].includes(newVal.toUpperCase())) {
    errors.push(`${field.header}: expected TRUE or FALSE, got "${newVal}"`);
  }
}

async function resolveGlossaryTermByName(name: string): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const rows = await sql<{ termName: string }[]>`
    SELECT term_name_text AS "termName" FROM bayanat.business_glossaries WHERE lower(term_name_text) = lower(${name}) AND parent_glossary_id IS NOT NULL
  `;
  if (rows.length === 0) return { ok: false, error: `Glossary term "${name}" not found` };
  if (rows.length > 1) return { ok: false, error: `Glossary term "${name}" is ambiguous (matches ${rows.length} terms)` };
  return { ok: true, value: rows[0].termName };
}

// ── Main entry point ─────────────────────────────────────────────────────────────

export function summarizePlans(plans: RowPlan[]): Record<string, number> {
  const totals: Record<string, number> = { rows: plans.length, updates: 0, creates: 0, skipped: 0, errors: 0, conflicts: 0 };
  for (const p of plans) {
    if (p.outcome === "UPDATE") totals.updates++;
    else if (p.outcome === "CREATE") totals.creates++;
    else if (p.outcome === "SKIPPED_NOOP") totals.skipped++;
    else if (p.outcome === "SKIPPED_CONFLICT") totals.conflicts++;
    else if (p.outcome === "ERROR") totals.errors++;
  }
  return totals;
}

export async function validateWorkbook(parsed: ParsedWorkbook, opts: ValidateOptions): Promise<RowPlan[]> {
  const plans: RowPlan[] = [];
  const canCreateTags = await canEditMetadata(opts.session);

  for (const sheet of ["DataSources", "Tables", "Columns"] as SheetName[]) {
    const rows = parsed.sheets[sheet];
    if (!rows) continue;
    const assetType = SHEET_ASSET_TYPE[sheet];
    const fields = getFieldsForSheet(sheet);
    const ids = rows.map((r) => toNum(r.values._ID)).filter((n): n is number => n != null);
    const currentMap =
      sheet === "DataSources" ? await fetchCurrentDataSources(ids) :
      sheet === "Tables" ? await fetchCurrentTables(ids) :
      await fetchCurrentColumns(ids);

    for (const row of rows) {
      const plan = await validateSimpleRow(sheet, assetType, fields, row, currentMap, opts, canCreateTags);
      plans.push(plan);
    }
  }

  const termRows = parsed.sheets.BusinessTerms;
  if (termRows) {
    const fields = getFieldsForSheet("BusinessTerms");
    const ids = termRows.map((r) => toNum(r.values._ID)).filter((n): n is number => n != null);
    const currentMap = await fetchCurrentTerms(ids);
    for (const row of termRows) {
      plans.push(await validateTermRow(fields, row, currentMap, opts));
    }
  }

  return plans;
}

async function validateSimpleRow(
  sheet: SheetName, assetType: string, fields: FieldDef[], row: ParsedRow,
  currentMap: Map<number, Record<string, string | null>>, opts: ValidateOptions, canCreateTags: boolean,
): Promise<RowPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idNum = toNum(row.values._ID);

  if (idNum == null) {
    errors.push("_ID is missing or not a number (only the Business Terms sheet allows creating new rows)");
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: null, isCreate: false, outcome: "ERROR", changes: [], errors, warnings };
  }
  const current = currentMap.get(idNum);
  if (!current) {
    errors.push(`_ID ${idNum}: no matching ${assetType} found`);
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes: [], errors, warnings };
  }

  const canEdit = await canEditAsset(opts.session, assetType as "DATA_ENTITIES" | "DATA_ATTRIBUTES" | "DATA_SOURCES", idNum);
  if (!canEdit) {
    errors.push("You don't have edit permission on this asset");
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes: [], errors, warnings };
  }

  const changes: FieldChange[] = [];
  let newTagNames: string[] = [];
  for (const field of fields) {
    if (field.kind !== "EDITABLE") continue;
    const raw = row.values[field.key] ?? "";
    const oldVal = current[field.key] ?? null;

    if (field.type === "TAGS") {
      if (raw.trim() === "") continue; // blank tags cell = no change to tags, even in strict mode (avoid accidental mass-untagging)
      const { newTagNames: created, error } = await resolveTagIds(raw, canCreateTags);
      if (error) { errors.push(error); continue; }
      newTagNames = created;
      const normalized = raw.split(";").map((s) => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).join("; ");
      const oldNormalized = (oldVal ?? "").split(";").map((s) => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).join("; ");
      if (normalized !== oldNormalized) changes.push({ field: field.key, header: field.header, oldVal, newVal: normalized });
      continue;
    }

    const { newVal, touched } = resolveNewValue(raw, oldVal, opts.strictMode);
    if (!touched) continue;

    if (field.type === "TERM" && newVal) {
      const resolved = await resolveGlossaryTermByName(newVal);
      if (!resolved.ok) { errors.push(resolved.error); continue; }
      changes.push({ field: field.key, header: field.header, oldVal, newVal: resolved.value });
      continue;
    }

    await validateFieldValue(field, newVal, errors);
    changes.push({ field: field.key, header: field.header, oldVal, newVal });
  }

  if (errors.length > 0) {
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes, errors, warnings };
  }
  if (changes.length === 0) {
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "SKIPPED_NOOP", changes, errors, warnings };
  }
  if (await wasModifiedSince(assetType, idNum, opts.exportSnapshotAt)) {
    return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "SKIPPED_CONFLICT", changes, errors, warnings };
  }
  return { sheet, rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "UPDATE", changes, errors, warnings, newTagNames };
}

async function validateTermRow(
  fields: FieldDef[], row: ParsedRow, currentMap: Map<number, Record<string, string | null>>, opts: ValidateOptions,
): Promise<RowPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const assetType = "BUSINESS_TERMS";
  const idNum = toNum(row.values._ID);

  if (idNum == null) {
    // Create new term (only sheet where creation is allowed — spec §3.1 step 1)
    const termName = row.values.termName?.trim();
    const domainName = row.values.domainName?.trim();
    const definition = row.values.definition?.trim();
    if (!termName) errors.push("Term Name is required to create a new term");
    if (!domainName) errors.push("Domain is required to create a new term");
    if (!definition) errors.push("Definition is required to create a new term");

    let domainId: number | null = null;
    if (domainName) {
      const [domain] = await sql<{ id: number }[]>`
        SELECT glossary_id AS id FROM bayanat.business_glossaries WHERE lower(term_name_text) = lower(${domainName}) AND parent_glossary_id IS NULL
      `;
      if (!domain) errors.push(`Domain "${domainName}" not found`);
      else domainId = domain.id;
    }
    if (termName && domainId != null) {
      const [dup] = await sql<{ id: number }[]>`
        SELECT glossary_id AS id FROM bayanat.business_glossaries WHERE lower(term_name_text) = lower(${termName}) AND parent_glossary_id = ${domainId}
      `;
      if (dup) errors.push(`Term "${termName}" already exists in domain "${domainName}"`);
    }
    if (row.values.classification) await validateFieldValue(fields.find((f) => f.key === "classification")!, row.values.classification, errors);
    if (row.values.piCategory) await validateFieldValue(fields.find((f) => f.key === "piCategory")!, row.values.piCategory, errors);

    if (errors.length > 0) return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: null, isCreate: true, outcome: "ERROR", changes: [], errors, warnings };

    return {
      sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: null, isCreate: true, outcome: "CREATE",
      changes: fields.filter((f) => f.kind === "EDITABLE" && row.values[f.key]).map((f) => ({ field: f.key, header: f.header, oldVal: null, newVal: row.values[f.key] })),
      errors, warnings,
      createPayload: { termName, domainId, definition, ...Object.fromEntries(fields.filter((f) => !["termName", "domainName", "definition"].includes(f.key)).map((f) => [f.key, row.values[f.key] || null])) },
    };
  }

  // Update existing term
  const current = currentMap.get(idNum);
  if (!current) {
    return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes: [], errors: [`_ID ${idNum}: no matching business term found`], warnings };
  }
  const canEdit = await canEditMetadata(opts.session);
  if (!canEdit) {
    return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes: [], errors: ["You don't have edit permission on business terms"], warnings };
  }

  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (field.kind !== "EDITABLE" || field.key === "domainName") continue; // domain reassignment via bulk not supported in v1
    const raw = row.values[field.key] ?? "";
    const oldVal = current[field.key] ?? null;
    const { newVal, touched } = resolveNewValue(raw, oldVal, opts.strictMode);
    if (!touched) continue;
    await validateFieldValue(field, newVal, errors);
    changes.push({ field: field.key, header: field.header, oldVal, newVal });
  }

  if (errors.length > 0) return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "ERROR", changes, errors, warnings };
  if (changes.length === 0) return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "SKIPPED_NOOP", changes, errors, warnings };
  if (await wasModifiedSince("BUSINESS_TERMS", idNum, opts.exportSnapshotAt)) {
    return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "SKIPPED_CONFLICT", changes, errors, warnings };
  }
  return { sheet: "BusinessTerms", rowNumber: row.rowNumber, assetType, assetId: idNum, isCreate: false, outcome: "UPDATE", changes, errors, warnings };
}
