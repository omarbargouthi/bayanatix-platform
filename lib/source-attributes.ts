// Fills Custom Attributes from the source system during a crawl, using the
// per-attribute source mappings (db/141): a SQL Server extended property, or a
// "key: value" pair inside the table/column comment. The source always wins;
// on a re-crawl, every value that changes is handed back to the crawler so it
// lands in that table's METADATA_UPDATE review request.
import { sql } from "./db";
import { logUpdate } from "./audit";

export type SourceMethod = "EXTENDED_PROPERTY" | "COMMENT_KEY";
export const MAPPABLE_SOURCE_TYPES = ["MSSQL", "POSTGRES", "ORACLE", "MYSQL"] as const;

// Minimal shapes of what the crawler hands over (structurally matches lib/crawler.ts).
type SrcColumn = { name: string; comment?: string | null; extProps?: Record<string, string> };
type SrcTable = { name: string; comment?: string | null; extProps?: Record<string, string>; columns: SrcColumn[] };
type SrcSchema = { name: string; tables: SrcTable[] };
export type AttributeChange = { asset: string; attrName: string; oldValue: string | null; newValue: string | null };
type ChangeSink = (entityId: number, entityName: string, schemaId: number, change: AttributeChange) => void;

/**
 * Reads `key: value` pairs out of a comment. Accepted forms (keys are one word,
 * matched case-insensitively):
 *   "Customer email address; owner: Finance; retention: 7y"
 *   "Customer email address. Owner=Finance | PII=yes"
 *   "Customer email address {"owner": "Finance", "retention": "7y"}"
 */
export function parseCommentKeyValues(comment: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!comment) return out;
  const json = comment.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const obj = JSON.parse(json[0]);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) if (v != null && typeof v !== "object") out[k.toLowerCase()] = String(v).trim();
      }
    } catch { /* not JSON — fall through to key: value pairs */ }
  }
  const text = json ? comment.replace(json[0], " ") : comment;
  const re = /(?:^|[;|\n,]|\.\s)\s*([A-Za-z_][\w-]*)\s*[:=]\s*([^;|\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = m[2].trim().replace(/[.,]$/, "");
  }
  return out;
}

type Def = { attrDefId: number; assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES"; attrCode: string; attrName: string; dataType: string; enumValues: string[] | null };
type MappedDef = Def & { method: SourceMethod; sourceKey: string };

// Converts the raw source text to the attribute's type; null = not a valid value for it.
export function coerceSourceValue(def: Pick<Def, "dataType" | "enumValues">, raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (!v) return null;
  switch (def.dataType) {
    case "BOOLEAN":
      if (/^(true|yes|y|1)$/i.test(v)) return true;
      if (/^(false|no|n|0)$/i.test(v)) return false;
      return null;
    case "NUMBER": {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "DATE":
      return /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)) ? v.slice(0, 10) : null;
    case "ENUM":
      return (def.enumValues ?? []).find((o) => o.toLowerCase() === v.toLowerCase()) ?? null;
    default:
      return v;
  }
}

const display = (v: unknown) => (v === undefined || v === null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

export async function applySourceAttributes(opts: {
  sourceId: number; dbTypeCode: string; schemas: SrcSchema[]; isFirstCrawl: boolean;
  actor: string; log: (msg: string) => Promise<void>; onChange: ChangeSink;
}): Promise<void> {
  if (!(MAPPABLE_SOURCE_TYPES as readonly string[]).includes(opts.dbTypeCode)) return;

  const rows: MappedDef[] = await sql<MappedDef[]>`
    SELECT d.attr_def_id AS "attrDefId", d.asset_type_code AS "assetType", d.attr_code AS "attrCode", d.attr_name_text AS "attrName",
           d.data_type_code AS "dataType", d.enum_values_json AS "enumValues", m.method_code AS method, m.source_key_text AS "sourceKey"
    FROM bayanat.custom_attribute_source_mappings m
    JOIN bayanat.custom_attribute_definitions d ON d.attr_def_id = m.attr_def_id
    WHERE m.source_type_code = ${opts.dbTypeCode} AND d.is_enabled_indicator = true
      AND d.asset_type_code IN ('DATA_ENTITIES', 'DATA_ATTRIBUTES')
  `;
  if (rows.length === 0) return;
  const tableDefs = rows.filter((r) => r.assetType === "DATA_ENTITIES");
  const columnDefs = rows.filter((r) => r.assetType === "DATA_ATTRIBUTES");

  // Catalog ids for everything this source just saved, by name.
  const entityRows = await sql<{ id: number; schemaId: number; schema: string; name: string }[]>`
    SELECT e.entity_id AS id, s.schema_id AS "schemaId", s.schema_name_text AS schema, e.entity_name_text AS name
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const entityByName = new Map(entityRows.map((e) => [`${e.schema}|${e.name}`, e]));
  const attrRows = columnDefs.length === 0 ? [] : await sql<{ id: number; entityId: number; name: string }[]>`
    SELECT a.attribute_id AS id, a.entity_id AS "entityId", a.physical_name_text AS name
    FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const attrByName = new Map(attrRows.map((a) => [`${a.entityId}|${a.name}`, Number(a.id)]));

  // Current values for every asset we may touch, in two batched reads.
  const loadValues = async (assetType: string, ids: number[]) => {
    if (ids.length === 0) return new Map<number, { values: Record<string, unknown>; synced: Record<string, unknown> }>();
    const r = await sql<{ id: number; values: Record<string, unknown>; synced: Record<string, unknown> }[]>`
      SELECT asset_id AS id, values_json AS values, source_synced_json AS synced
      FROM bayanat.custom_attribute_values WHERE asset_type_code = ${assetType} AND asset_id = ANY(${ids})
    `;
    return new Map(r.map((x) => [Number(x.id), { values: x.values ?? {}, synced: x.synced ?? {} }]));
  };
  const entityValues = await loadValues("DATA_ENTITIES", tableDefs.length ? entityRows.map((e) => Number(e.id)) : []);
  const attrValues = await loadValues("DATA_ATTRIBUTES", attrRows.map((a) => Number(a.id)));

  const now = new Date().toISOString();
  let written = 0, invalid = 0;

  const applyAsset = async (
    assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES", assetId: number, label: string, defs: MappedDef[],
    comment: string | null | undefined, extProps: Record<string, string> | undefined,
    current: { values: Record<string, unknown>; synced: Record<string, unknown> } | undefined,
    entity: { id: number; name: string; schemaId: number },
  ) => {
    const kv = parseCommentKeyValues(comment);
    const props = Object.fromEntries(Object.entries(extProps ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const values = { ...(current?.values ?? {}) };
    const synced = { ...(current?.synced ?? {}) };
    const audit: { field: string; oldVal: string | null; newVal: string | null }[] = [];

    for (const def of defs) {
      const raw = def.method === "EXTENDED_PROPERTY" ? props[def.sourceKey.toLowerCase()] : kv[def.sourceKey.toLowerCase()];
      let next: string | number | boolean | null | undefined;
      if (raw === undefined) {
        // Gone at the source: clear it only if it had come from the source.
        if (!(def.attrCode in synced)) continue;
        next = null;
        delete synced[def.attrCode];
      } else {
        next = coerceSourceValue(def, raw);
        if (next === null) {
          invalid++;
          await opts.log(`  ⚠ ${label}: "${raw}" isn't a valid ${def.dataType.toLowerCase()} for ${def.attrName} — skipped`);
          continue;
        }
        synced[def.attrCode] = { value: next, sourceKey: def.sourceKey, method: def.method, crawledAt: now };
      }
      const before = values[def.attrCode];
      if (display(before) === display(next)) continue;
      if (next === null) delete values[def.attrCode]; else values[def.attrCode] = next;
      audit.push({ field: `custom_attribute:${def.attrCode}`, oldVal: display(before), newVal: display(next) });
      if (!opts.isFirstCrawl) opts.onChange(entity.id, entity.name, entity.schemaId, { asset: label, attrName: def.attrName, oldValue: display(before), newValue: display(next) });
    }

    const syncedChanged = JSON.stringify(synced) !== JSON.stringify(current?.synced ?? {});
    if (audit.length === 0 && !syncedChanged) return;
    await sql`
      INSERT INTO bayanat.custom_attribute_values (asset_type_code, asset_id, values_json, source_synced_json, updated_by_user_id)
      VALUES (${assetType}, ${assetId}, ${sql.json(values as never)}, ${sql.json(synced as never)}, ${opts.actor})
      ON CONFLICT (asset_type_code, asset_id) DO UPDATE SET
        values_json = EXCLUDED.values_json, source_synced_json = EXCLUDED.source_synced_json,
        updated_by_user_id = CASE WHEN ${audit.length > 0} THEN EXCLUDED.updated_by_user_id ELSE bayanat.custom_attribute_values.updated_by_user_id END,
        updated_at = CASE WHEN ${audit.length > 0} THEN NOW() ELSE bayanat.custom_attribute_values.updated_at END
    `;
    if (audit.length > 0) {
      written += audit.length;
      await logUpdate(assetType, assetId, opts.actor, audit).catch(() => {});
    }
  };

  for (const schema of opts.schemas) {
    for (const table of schema.tables) {
      const e = entityByName.get(`${schema.name}|${table.name}`);
      if (!e) continue;
      const entity = { id: Number(e.id), name: e.name, schemaId: Number(e.schemaId) };
      if (tableDefs.length) {
        await applyAsset("DATA_ENTITIES", entity.id, table.name, tableDefs, table.comment, table.extProps, entityValues.get(entity.id), entity);
      }
      if (columnDefs.length) {
        for (const col of table.columns) {
          const attrId = attrByName.get(`${entity.id}|${col.name}`);
          if (attrId == null) continue;
          await applyAsset("DATA_ATTRIBUTES", attrId, `${table.name}.${col.name}`, columnDefs, col.comment, col.extProps, attrValues.get(attrId), entity);
        }
      }
    }
  }
  await opts.log(`Custom attributes from source: ${written} value(s) updated${invalid ? `, ${invalid} skipped as invalid` : ""}`);
}
