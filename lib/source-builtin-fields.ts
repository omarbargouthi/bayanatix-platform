// Fills built-in descriptive fields from the source system during a crawl (db/166), the
// same way lib/source-attributes.ts fills custom attributes: each field can be mapped,
// per source type, to a SQL Server extended property or to a "key: value" pair inside
// the table / column comment.
//
//   TABLE_TYPE     table   one of Bayanis's table types (the TABLE_TYPE lookup)
//   COLUMN_TYPE    column  Business / Technical
//   FRIENDLY_NAME  column  free text
//   ENCRYPTED      column  yes / no
//
// A value is applied only when it lines up with what Bayanis defines for the field; one
// that doesn't is skipped and reported in the crawl log. The source wins over what is in
// the catalog, and on a re-crawl every changed value joins that table's metadata-update
// review, like any other change the crawl finds. A value that disappears from the source
// is left as it is — only the "came from the source" marker is dropped.
import { sql } from "./db";
import { logUpdate } from "./audit";
import { parseCommentKeyValues, MAPPABLE_SOURCE_TYPES, type SourceMethod, type AttributeChange } from "./source-attributes";

export const BUILTIN_FIELDS = [
  { code: "TABLE_TYPE",    level: "TABLE",  label: "Table type",    hint: "Master, Transactional, Reference, Staging or Reporting — by code or by name" },
  { code: "COLUMN_TYPE",   level: "COLUMN", label: "Column type",   hint: "Business or Technical" },
  { code: "FRIENDLY_NAME", level: "COLUMN", label: "Friendly name", hint: "Any text" },
  { code: "ENCRYPTED",     level: "COLUMN", label: "Encrypted",     hint: "yes / no, true / false, encrypted / none" },
] as const;
export type BuiltinFieldCode = (typeof BUILTIN_FIELDS)[number]["code"];
export type BuiltinFieldMapping = { fieldCode: BuiltinFieldCode; sourceTypeCode: string; methodCode: SourceMethod; sourceKey: string };

type SrcColumn = { name: string; comment?: string | null; extProps?: Record<string, string> };
type SrcTable = { name: string; comment?: string | null; extProps?: Record<string, string>; columns: SrcColumn[] };
type SrcSchema = { name: string; tables: SrcTable[] };
type ChangeSink = (entityId: number, entityName: string, schemaId: number, change: AttributeChange) => void;
type Synced = Record<string, { value: string | boolean; sourceKey: string; method: SourceMethod; crawledAt: string }>;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_/-]+/g, " ");

/** "master", "Master Data", "MASTER" -> "MASTER"; null when it is not one of Bayanis's table types. */
export function matchTableType(raw: string, types: { code: string; label: string }[]): string | null {
  const v = norm(raw);
  if (!v) return null;
  for (const t of types) {
    const label = norm(t.label);
    // "Reference / Lookup" also answers to "reference" and to "lookup".
    const words = t.label.split("/").map(norm);
    if (v === norm(t.code) || v === label || words.includes(v) || v === words[0].split(" ")[0]) return t.code;
  }
  return null;
}
export function matchColumnType(raw: string): "BUSINESS" | "TECHNICAL" | null {
  const v = norm(raw);
  if (/^(business|biz|b)$/.test(v)) return "BUSINESS";
  if (/^(technical|tech|t|system)$/.test(v)) return "TECHNICAL";
  return null;
}
export function matchEncrypted(raw: string): boolean | null {
  const v = norm(raw);
  if (/^(true|yes|y|1|encrypted|on)$/.test(v)) return true;
  if (/^(false|no|n|0|none|not encrypted|unencrypted|plain|plaintext|clear|off)$/.test(v)) return false;
  return null;
}

export async function listBuiltinFieldMappings(): Promise<BuiltinFieldMapping[]> {
  return sql<BuiltinFieldMapping[]>`
    SELECT field_code AS "fieldCode", source_type_code AS "sourceTypeCode", method_code AS "methodCode", source_key_text AS "sourceKey"
    FROM bayanat.builtin_field_source_mappings ORDER BY field_code, source_type_code
  `;
}

/** Sets (or, with an empty key, removes) the mapping of one field for one source type. */
export async function saveBuiltinFieldMapping(m: BuiltinFieldMapping, userId: string): Promise<void> {
  if (!BUILTIN_FIELDS.some((f) => f.code === m.fieldCode)) throw new Error("Unknown field");
  if (!(MAPPABLE_SOURCE_TYPES as readonly string[]).includes(m.sourceTypeCode)) throw new Error("This source type can't be mapped");
  const key = m.sourceKey.trim();
  if (!key) {
    await sql`DELETE FROM bayanat.builtin_field_source_mappings WHERE field_code = ${m.fieldCode} AND source_type_code = ${m.sourceTypeCode}`;
    return;
  }
  if (m.methodCode !== "EXTENDED_PROPERTY" && m.methodCode !== "COMMENT_KEY") throw new Error("Unknown method");
  if (m.methodCode === "EXTENDED_PROPERTY" && m.sourceTypeCode !== "MSSQL") throw new Error("Extended properties exist on SQL Server only");
  if (m.methodCode === "COMMENT_KEY" && !/^[A-Za-z_][\w-]*$/.test(key)) throw new Error("A comment key is one word: letters, digits, _ or -");
  await sql`
    INSERT INTO bayanat.builtin_field_source_mappings (field_code, source_type_code, method_code, source_key_text, created_by_user_id)
    VALUES (${m.fieldCode}, ${m.sourceTypeCode}, ${m.methodCode}, ${key.slice(0, 128)}, ${userId})
    ON CONFLICT (field_code, source_type_code) DO UPDATE SET method_code = EXCLUDED.method_code, source_key_text = EXCLUDED.source_key_text
  `;
}

export async function applySourceBuiltinFields(opts: {
  sourceId: number; dbTypeCode: string; schemas: SrcSchema[]; isFirstCrawl: boolean;
  actor: string; log: (msg: string) => Promise<void>; onChange: ChangeSink;
}): Promise<void> {
  if (!(MAPPABLE_SOURCE_TYPES as readonly string[]).includes(opts.dbTypeCode)) return;
  const mappings = (await listBuiltinFieldMappings()).filter((m) => m.sourceTypeCode === opts.dbTypeCode);
  if (mappings.length === 0) return;
  const mapOf = (code: BuiltinFieldCode) => mappings.find((m) => m.fieldCode === code);
  const tableTypeMap = mapOf("TABLE_TYPE");
  const columnMaps = (["COLUMN_TYPE", "FRIENDLY_NAME", "ENCRYPTED"] as const).map(mapOf).filter((m): m is BuiltinFieldMapping => !!m);

  const tableTypes = await sql<{ code: string; label: string }[]>`
    SELECT lookup_code AS code, lookup_label AS label FROM bayanat.app_lookups WHERE lookup_group = 'TABLE_TYPE' AND is_active
  `;
  const entities = await sql<{ id: number; schemaId: number; schema: string; name: string; tableType: string | null; synced: Synced }[]>`
    SELECT e.entity_id AS id, s.schema_id AS "schemaId", s.schema_name_text AS schema, e.entity_name_text AS name,
           e.entity_category_code AS "tableType", e.source_synced_json AS synced
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const entityByName = new Map(entities.map((e) => [`${e.schema}|${e.name}`, e]));
  const attrs = columnMaps.length === 0 ? [] : await sql<{ id: number; entityId: number; name: string; columnType: string | null; friendlyName: string | null; encrypted: boolean | null; synced: Synced }[]>`
    SELECT a.attribute_id AS id, a.entity_id AS "entityId", a.physical_name_text AS name, a.attribute_class_code AS "columnType",
           a.friendly_name_text AS "friendlyName", a.is_encrypted AS encrypted, a.source_synced_json AS synced
    FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const attrByName = new Map(attrs.map((a) => [`${a.entityId}|${a.name}`, a]));

  const now = new Date().toISOString();
  let written = 0, skipped = 0;
  const show = (v: unknown) => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
  const read = (m: BuiltinFieldMapping, comment: string | null | undefined, extProps: Record<string, string> | undefined): string | undefined => {
    const key = m.sourceKey.toLowerCase();
    if (m.methodCode === "EXTENDED_PROPERTY") return Object.entries(extProps ?? {}).find(([k]) => k.toLowerCase() === key)?.[1];
    return parseCommentKeyValues(comment)[key];
  };

  for (const schema of opts.schemas) {
    for (const table of schema.tables) {
      const e = entityByName.get(`${schema.name}|${table.name}`);
      if (!e) continue;
      const entity = { id: Number(e.id), name: e.name, schemaId: Number(e.schemaId) };

      // ── Table type ──
      if (tableTypeMap) {
        const synced: Synced = { ...(e.synced ?? {}) };
        const raw = read(tableTypeMap, table.comment, table.extProps);
        if (raw === undefined || !raw.trim()) {
          if ("TABLE_TYPE" in synced) { delete synced.TABLE_TYPE; await sql`UPDATE bayanat.data_entities SET source_synced_json = ${sql.json(synced as never)} WHERE entity_id = ${entity.id}`; }
        } else {
          const code = matchTableType(raw, tableTypes);
          if (!code) {
            skipped++;
            await opts.log(`  ⚠ ${table.name}: table type "${raw}" from the source is not one of Bayanis's table types — skipped`);
          } else {
            synced.TABLE_TYPE = { value: code, sourceKey: tableTypeMap.sourceKey, method: tableTypeMap.methodCode, crawledAt: now };
            const changed = e.tableType !== code;
            await sql`
              UPDATE bayanat.data_entities SET
                entity_category_code = ${code}, source_synced_json = ${sql.json(synced as never)},
                category_is_confirmed = true,
                -- confirmed by the source, not by a person (the column only takes a user id)
                category_confirmed_by = CASE WHEN ${changed} OR category_is_confirmed IS NOT TRUE THEN NULL ELSE category_confirmed_by END,
                category_confirmed_at = CASE WHEN ${changed} OR category_is_confirmed IS NOT TRUE THEN NOW() ELSE category_confirmed_at END
              WHERE entity_id = ${entity.id}
            `;
            if (changed) {
              written++;
              await logUpdate("DATA_ENTITIES", entity.id, opts.actor, [{ field: "entity_category_code", oldVal: e.tableType, newVal: code }]).catch(() => {});
              if (!opts.isFirstCrawl) opts.onChange(entity.id, entity.name, entity.schemaId, { asset: table.name, attrName: "Table type", oldValue: e.tableType, newValue: code });
            }
          }
        }
      }

      // ── Column fields ──
      if (columnMaps.length === 0) continue;
      for (const col of table.columns) {
        const a = attrByName.get(`${entity.id}|${col.name}`);
        if (!a) continue;
        const label = `${table.name}.${col.name}`;
        const synced: Synced = { ...(a.synced ?? {}) };
        const audit: { field: string; oldVal: string | null; newVal: string | null }[] = [];
        let columnType = a.columnType, friendlyName = a.friendlyName, encrypted = a.encrypted;

        for (const m of columnMaps) {
          const raw = read(m, col.comment, col.extProps);
          if (raw === undefined || !raw.trim()) { delete synced[m.fieldCode]; continue; }
          const field = BUILTIN_FIELDS.find((f) => f.code === m.fieldCode)!;
          let value: string | boolean | null;
          if (m.fieldCode === "COLUMN_TYPE") value = matchColumnType(raw);
          else if (m.fieldCode === "ENCRYPTED") value = matchEncrypted(raw);
          else value = raw.trim().slice(0, 255);
          if (value === null) {
            skipped++;
            await opts.log(`  ⚠ ${label}: "${raw}" from the source is not a valid ${field.label.toLowerCase()} — skipped`);
            continue;
          }
          synced[m.fieldCode] = { value, sourceKey: m.sourceKey, method: m.methodCode, crawledAt: now };
          const before = m.fieldCode === "COLUMN_TYPE" ? columnType : m.fieldCode === "ENCRYPTED" ? encrypted : friendlyName;
          if (show(before) === show(value) && before != null) continue;
          if (m.fieldCode === "COLUMN_TYPE") columnType = value as string;
          else if (m.fieldCode === "ENCRYPTED") encrypted = value as boolean;
          else friendlyName = value as string;
          const auditField = m.fieldCode === "COLUMN_TYPE" ? "attribute_class_code" : m.fieldCode === "ENCRYPTED" ? "is_encrypted" : "friendly_name_text";
          audit.push({ field: auditField, oldVal: show(before), newVal: show(value) });
          if (!opts.isFirstCrawl) opts.onChange(entity.id, entity.name, entity.schemaId, { asset: label, attrName: field.label, oldValue: show(before), newValue: show(value) });
        }

        const syncedChanged = JSON.stringify(synced) !== JSON.stringify(a.synced ?? {});
        if (audit.length === 0 && !syncedChanged) continue;
        const typeFromSource = "COLUMN_TYPE" in synced;
        await sql`
          UPDATE bayanat.data_attributes SET
            attribute_class_code = ${columnType}, friendly_name_text = ${friendlyName}, is_encrypted = ${encrypted},
            source_synced_json = ${sql.json(synced as never)},
            -- A column type that comes from the source is a settled classification, not a suggestion.
            suggestion_status_code  = CASE WHEN ${typeFromSource} THEN 'ACCEPTED' ELSE suggestion_status_code END,
            classified_by_user_id   = CASE WHEN ${typeFromSource} AND attribute_class_code IS DISTINCT FROM ${columnType} THEN 'SYSTEM:SOURCE' ELSE classified_by_user_id END,
            classified_at_timestamp = CASE WHEN ${typeFromSource} AND attribute_class_code IS DISTINCT FROM ${columnType} THEN NOW() ELSE classified_at_timestamp END
          WHERE attribute_id = ${a.id}
        `;
        if (audit.length > 0) {
          written += audit.length;
          await logUpdate("DATA_ATTRIBUTES", Number(a.id), opts.actor, audit).catch(() => {});
        }
      }
    }
  }
  await opts.log(`Built-in fields from source: ${written} value(s) updated${skipped ? `, ${skipped} skipped as not matching Bayanis's definitions` : ""}`);
}
