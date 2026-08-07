// AI Chat Assistant tool registry (spec §2). Each tool is a thin, read-only adapter
// over an already-existing query function — no new data paths, and every tool calls
// the exact same functions the equivalent UI page already uses, at the same
// (session-authenticated, coarse) access level. Zero/ambiguous results are always
// returned as `ok: true` with an empty/ambiguous payload, never a distinct error —
// the system prompt (lib/chat/system-prompt.ts) is what turns that into the uniform
// "no accessible results" phrasing (FR-3.1); `ok: false` is reserved for genuine
// execution failures (bad args, DB errors).

import { sql } from "@/lib/db";
import { runSearch } from "@/lib/search/search-service";
import { ALL_TYPES, type SearchHitType, type FullSearchHit } from "@/lib/search-types";
import {
  getEntityById, getSchemaById, getSourcesWithSchemas, getClassificationStatsScoped,
} from "@/lib/queries/catalog";
import { getEntityDqScore, getDqRules } from "@/lib/queries/dq";
import { getGlossaryTerms, getGlossaryTermById } from "@/lib/queries/glossary";
import { listOpenDatasets, getDatasetColumns } from "@/lib/queries/open-data";
import { listDsas } from "@/lib/queries/sharing";
import { listFoiRequests, getFoiCase, getFoiStats } from "@/lib/queries/foi";
import type { SourceRef, ToolDefinition, ToolResult } from "./types";

function ok(data: unknown, sources: SourceRef[] = []): ToolResult {
  return { ok: true, data, sources };
}
function notFound(): ToolResult {
  return { ok: true, data: { found: false }, sources: [] };
}
function ambiguous(candidates: string[]): ToolResult {
  return { ok: true, data: { ambiguous: true, candidates: candidates.slice(0, 8) }, sources: [] };
}

function hitToSourceRef(hit: FullSearchHit): SourceRef {
  return { assetType: hit.type, assetId: hit.id, label: hit.name, href: hit.href };
}

// ── search_assets ────────────────────────────────────────────────────────────
const searchAssets: ToolDefinition = {
  name: "search_assets",
  description: "Free-text search across data assets (tables, views, columns, schemas, sources, glossary terms, tags, DQ rules, sharing agreements, open data, FOI requests). Use this first when the user names an asset by an approximate name.",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "Search text" },
      types: { type: "array", items: { type: "string", enum: ALL_TYPES }, description: "Optional: restrict to specific asset types" },
    },
    required: ["q"],
  },
  run: async (args) => {
    const q = String(args.q ?? "").trim();
    if (!q) return { ok: false, error: "q is required" };
    const requested = Array.isArray(args.types) ? (args.types as string[]) : [];
    const types = requested.filter((t): t is SearchHitType => (ALL_TYPES as string[]).includes(t));
    const result = await runSearch({ q, types, page: 1, limit: 10, facets: {} });
    const top = result.results.slice(0, 10);
    return ok(
      { total: result.total, results: top.map((r) => ({ type: r.type, name: r.name, description: r.description, href: r.href })), suggestions: result.suggestions ?? [] },
      top.map(hitToSourceRef),
    );
  },
};

// ── get_asset ────────────────────────────────────────────────────────────────
const getAsset: ToolDefinition = {
  name: "get_asset",
  description: "Get details for a specific catalog asset by exact type and numeric id (obtained from a prior search_assets call).",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"] },
      id: { type: "number" },
    },
    required: ["type", "id"],
  },
  run: async (args) => {
    const type = String(args.type ?? "");
    const id = Number(args.id);
    if (!Number.isFinite(id)) return { ok: false, error: "id must be a number" };

    if (type === "DATA_ENTITIES") {
      const e = await getEntityById(id);
      if (!e) return notFound();
      const href = `/catalog/${e.schemaId}/tables/${e.entityId}`;
      return ok(
        { name: e.entityName, description: e.description, isView: e.isView, rowCount: e.rowCount, schema: e.schema?.schemaName ?? null, source: e.source?.sourceName ?? null, columnCount: e.attributes.length, certified: e.certCode, trustScore: e.trustScore },
        [{ assetType: "DATA_ENTITIES", assetId: e.entityId, label: e.entityName, href }],
      );
    }
    if (type === "DATA_SCHEMAS") {
      const s = await getSchemaById(id);
      if (!s) return notFound();
      const href = `/catalog/${s.schemaId}`;
      return ok(
        { name: s.schemaName, description: s.description, source: s.source?.sourceName ?? null, tableCount: s.entities.length },
        [{ assetType: "DATA_SCHEMAS", assetId: s.schemaId, label: s.schemaName, href }],
      );
    }
    if (type === "DATA_SOURCES") {
      const sources = await getSourcesWithSchemas();
      const src = sources.find((s) => s.dataSourceId === id);
      if (!src) return notFound();
      return ok(
        { name: src.sourceName, type: src.sourceType, description: src.description, schemaCount: src.schemas.length },
        [{ assetType: "DATA_SOURCES", assetId: src.dataSourceId, label: src.sourceName, href: null }],
      );
    }
    if (type === "DATA_ATTRIBUTES") {
      const rows = await sql<{ name: string; friendlyName: string | null; dataType: string; description: string | null; classification: string | null; entityId: number; entityName: string; schemaId: number }[]>`
        SELECT a.physical_name_text AS name, a.friendly_name_text AS "friendlyName", a.data_type_text AS "dataType",
               a.description_text AS description, a.classification_code AS classification,
               e.entity_id AS "entityId", e.entity_name_text AS "entityName", e.schema_id AS "schemaId"
        FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.attribute_id = ${id}
      `;
      const a = rows[0];
      if (!a) return notFound();
      const href = `/catalog/${a.schemaId}/tables/${a.entityId}`;
      return ok(
        { name: a.name, friendlyName: a.friendlyName, dataType: a.dataType, description: a.description, classification: a.classification, table: a.entityName },
        [{ assetType: "DATA_ATTRIBUTES", assetId: id, label: a.name, href }],
      );
    }
    return { ok: false, error: `Unsupported asset type "${type}"` };
  },
};

// ── get_asset_children ───────────────────────────────────────────────────────
const getAssetChildren: ToolDefinition = {
  name: "get_asset_children",
  description: "List the direct children of a catalog asset: schemas of a source, tables/views of a schema, or columns of a table.",
  inputSchema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES"] },
      id: { type: "number" },
    },
    required: ["type", "id"],
  },
  run: async (args) => {
    const type = String(args.type ?? "");
    const id = Number(args.id);
    if (!Number.isFinite(id)) return { ok: false, error: "id must be a number" };

    if (type === "DATA_SOURCES") {
      const sources = await getSourcesWithSchemas();
      const src = sources.find((s) => s.dataSourceId === id);
      if (!src) return notFound();
      return ok(
        { children: src.schemas.map((s) => ({ type: "DATA_SCHEMAS", id: s.schemaId, name: s.schemaName, tableCount: s.tableCount, viewCount: s.viewCount })) },
        src.schemas.map((s) => ({ assetType: "DATA_SCHEMAS", assetId: s.schemaId, label: s.schemaName, href: `/catalog/${s.schemaId}` })),
      );
    }
    if (type === "DATA_SCHEMAS") {
      const s = await getSchemaById(id);
      if (!s) return notFound();
      return ok(
        { children: s.entities.map((e) => ({ type: "DATA_ENTITIES", id: e.entityId, name: e.entityName, isView: e.isView, columnCount: e.columnCount })) },
        s.entities.map((e) => ({ assetType: "DATA_ENTITIES", assetId: e.entityId, label: e.entityName, href: `/catalog/${s.schemaId}/tables/${e.entityId}` })),
      );
    }
    if (type === "DATA_ENTITIES") {
      const e = await getEntityById(id);
      if (!e) return notFound();
      return ok(
        { children: e.attributes.map((a) => ({ name: a.physicalName, friendlyName: a.friendlyName, dataType: a.dataType, classification: a.classificationCode })) },
        [{ assetType: "DATA_ENTITIES", assetId: e.entityId, label: e.entityName, href: `/catalog/${e.schemaId}/tables/${e.entityId}` }],
      );
    }
    return { ok: false, error: `Unsupported asset type "${type}"` };
  },
};

// ── get_classification_summary ──────────────────────────────────────────────
const getClassificationSummary: ToolDefinition = {
  name: "get_classification_summary",
  description: "Get classification coverage stats (percent classified, PII count, CDE count, unclassified count) globally or scoped to a schema by name.",
  inputSchema: {
    type: "object",
    properties: { schemaName: { type: "string", description: "Optional schema name to scope to (e.g. 'finance')" } },
  },
  run: async (args) => {
    const schemaName = args.schemaName ? String(args.schemaName).trim() : "";
    if (!schemaName) {
      const stats = await getClassificationStatsScoped();
      return ok({ scope: "all schemas", ...stats }, []);
    }
    const rows = await sql<{ id: number; name: string }[]>`
      SELECT schema_id AS id, schema_name_text AS name FROM bayanat.data_schemas
      WHERE schema_name_text ILIKE ${`%${schemaName}%`} ORDER BY schema_name_text LIMIT 5
    `;
    if (rows.length === 0) return notFound();
    if (rows.length > 1) return ambiguous(rows.map((r) => r.name));
    const stats = await getClassificationStatsScoped({ schemaId: rows[0].id });
    return ok({ scope: rows[0].name, ...stats }, [{ assetType: "DATA_SCHEMAS", assetId: rows[0].id, label: rows[0].name, href: `/catalog/${rows[0].id}` }]);
  },
};

// ── get_dq_status ────────────────────────────────────────────────────────────
const getDqStatus: ToolDefinition = {
  name: "get_dq_status",
  description: "Get data quality status for a table by name: overall score, dimension breakdown, and per-rule pass/fail results.",
  inputSchema: {
    type: "object",
    properties: { tableName: { type: "string" } },
    required: ["tableName"],
  },
  run: async (args) => {
    const tableName = String(args.tableName ?? "").trim();
    if (!tableName) return { ok: false, error: "tableName is required" };
    const rows = await sql<{ id: number; name: string; schemaId: number }[]>`
      SELECT entity_id AS id, entity_name_text AS name, schema_id AS "schemaId" FROM bayanat.data_entities
      WHERE entity_name_text ILIKE ${`%${tableName}%`} ORDER BY entity_name_text LIMIT 5
    `;
    if (rows.length === 0) return notFound();
    if (rows.length > 1) return ambiguous(rows.map((r) => r.name));
    const entity = rows[0];
    const [score, rules] = await Promise.all([getEntityDqScore(entity.id), getDqRules({ entityId: entity.id })]);
    return ok(
      {
        table: entity.name,
        overallScore: score?.overallScore ?? null,
        completeness: score?.completeness ?? null,
        validity: score?.validity ?? null,
        uniqueness: score?.uniqueness ?? null,
        consistency: score?.consistency ?? null,
        rules: rules.map((r) => ({ name: r.ruleName, dimension: r.dimensionName, severity: r.severityLevelCode, lastScore: r.lastScore, lastStatus: r.lastStatusCode, active: r.isActive })),
      },
      [{ assetType: "DATA_ENTITIES", assetId: entity.id, label: entity.name, href: `/catalog/${entity.schemaId}/tables/${entity.id}` }],
    );
  },
};

// ── get_definitions ──────────────────────────────────────────────────────────
const getDefinitions: ToolDefinition = {
  name: "get_definitions",
  description: "Look up a business glossary term's definition by name. Glossary term names are stored in English only — if the user asked in another language, translate the term to English before calling this tool (the returned definition text may still be in English; translate it back into the user's language in your answer).",
  inputSchema: {
    type: "object",
    properties: { term: { type: "string" } },
    required: ["term"],
  },
  run: async (args) => {
    const term = String(args.term ?? "").trim();
    if (!term) return { ok: false, error: "term is required" };
    const all = await getGlossaryTerms();
    const matches = all.filter((t) => t.termName.toLowerCase().includes(term.toLowerCase()));
    if (matches.length === 0) return notFound();
    if (matches.length > 1) {
      const exact = matches.find((m) => m.termName.toLowerCase() === term.toLowerCase());
      if (!exact) return ambiguous(matches.map((m) => m.termName));
      matches.splice(0, matches.length, exact);
    }
    const detail = await getGlossaryTermById(matches[0].glossaryId);
    if (!detail) return notFound();
    return ok(
      { term: detail.termName, definition: detail.definition, classification: detail.classCode, isPii: detail.isPii, domain: detail.domainName },
      [{ assetType: "TERM", assetId: detail.glossaryId, label: detail.termName, href: `/glossary/${detail.glossaryId}` }],
    );
  },
};

// ── get_open_data ────────────────────────────────────────────────────────────
const getOpenData: ToolDefinition = {
  name: "get_open_data",
  description: "Look up a published Open Data dataset by name and list which columns it publishes.",
  inputSchema: {
    type: "object",
    properties: { datasetName: { type: "string" } },
    required: ["datasetName"],
  },
  run: async (args) => {
    const name = String(args.datasetName ?? "").trim();
    if (!name) return { ok: false, error: "datasetName is required" };
    const { data } = await listOpenDatasets({ search: name, limit: 5 });
    if (data.length === 0) return notFound();
    let match = data[0];
    if (data.length > 1) {
      const exact = data.find((d) => d.datasetName.toLowerCase() === name.toLowerCase());
      if (!exact) return ambiguous(data.map((d) => d.datasetName));
      match = exact;
    }
    const columns = await getDatasetColumns(match.datasetId);
    return ok(
      { dataset: match.datasetName, status: match.statusCode, publishedColumns: columns.map((c) => c.publishName ?? c.friendlyName ?? c.physicalName) },
      [{ assetType: "OPEN_DATA", assetId: match.datasetId, label: match.datasetName, href: `/open-data/${match.datasetId}` }],
    );
  },
};

// ── get_sharing_agreements ───────────────────────────────────────────────────
const getSharingAgreements: ToolDefinition = {
  name: "get_sharing_agreements",
  description: "List data sharing agreements (DSAs), optionally filtered by free-text search (title, counterparty, reference code).",
  inputSchema: {
    type: "object",
    properties: { search: { type: "string", description: "Optional search text" } },
  },
  run: async (args) => {
    const search = args.search ? String(args.search) : "";
    const { data } = await listDsas({ search, limit: 10 });
    if (data.length === 0) return notFound();
    return ok(
      { agreements: data.map((d) => ({ title: d.titleText, scope: d.sharingScopeCode, direction: d.directionCode, counterparty: d.counterpartyNameText, expiryDate: d.effectiveEndDate, status: d.statusCode, containsPersonalData: d.containsPersonalData })) },
      data.map((d) => ({ assetType: "SHARING_AGREEMENT", assetId: d.dsaId, label: d.titleText, href: `/sharing/${d.dsaId}` })),
    );
  },
};

// ── get_foi_stats ────────────────────────────────────────────────────────────
const getFoiStatsTool: ToolDefinition = {
  name: "get_foi_stats",
  description: "Get overall Freedom of Information (FOI) request statistics: total, active, overdue, awaiting action.",
  inputSchema: { type: "object", properties: {} },
  run: async () => {
    const stats = await getFoiStats();
    return ok(stats, [{ assetType: "FOI_REQUEST", assetId: 0, label: "FOI overview", href: "/foi" }]);
  },
};

// ── get_foi_request ──────────────────────────────────────────────────────────
const getFoiRequestTool: ToolDefinition = {
  name: "get_foi_request",
  description: "Look up a specific FOI request by its reference code (e.g. FOI-2026-0125).",
  inputSchema: {
    type: "object",
    properties: { reference: { type: "string" } },
    required: ["reference"],
  },
  run: async (args) => {
    const reference = String(args.reference ?? "").trim();
    if (!reference) return { ok: false, error: "reference is required" };
    const { rows } = await listFoiRequests({ search: reference, page: 1, limit: 5 });
    if (rows.length === 0) return notFound();
    const exact = rows.find((r) => r.referenceCode.toLowerCase() === reference.toLowerCase()) ?? rows[0];
    const detail = await getFoiCase(exact.foiRequestId);
    if (!detail) return notFound();
    return ok(
      { reference: detail.referenceCode, subject: detail.subjectText, status: detail.statusCode, submittedAt: detail.submittedAt, dueDate: detail.firstResponseDueDate, slaBusinessDaysLeft: detail.slaBusinessDaysLeft, assignedOfficer: detail.assignedOfficerName },
      [{ assetType: "FOI_REQUEST", assetId: detail.foiRequestId, label: detail.referenceCode, href: `/foi/${detail.foiRequestId}` }],
    );
  },
};

export const TOOL_REGISTRY: Record<string, ToolDefinition> = Object.fromEntries(
  [
    searchAssets, getAsset, getAssetChildren, getClassificationSummary, getDqStatus,
    getDefinitions, getOpenData, getSharingAgreements, getFoiStatsTool, getFoiRequestTool,
  ].map((t) => [t.name, t]),
);

export const TOOL_DEFS_FOR_LLM = Object.values(TOOL_REGISTRY).map((t) => ({
  name: t.name, description: t.description, input_schema: t.inputSchema,
}));
