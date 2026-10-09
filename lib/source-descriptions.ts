// What a crawl does with a table / column comment, beyond storing it.
//
// The comment is always kept whole as "From source system" (source_description_text).
// A comment may also carry `key: value` pairs that feed other fields (custom fields,
// built-in fields — see source-attributes.ts and source-builtin-fields.ts). The
// description a steward sees and edits should hold the prose only, so here:
//
//   * the pairs whose key is mapped to a field are taken out of the comment, and what
//     is left is the description text;
//   * that text is written to the asset's description when the description is empty, or
//     when it still holds what an earlier crawl wrote (nobody has edited it since);
//   * once a steward edits the description it is theirs: later crawls leave it alone and
//     only "From source system" keeps following the source.
//
// A comment with no mapped pairs is prose in full, so description and "From source
// system" start out identical.
import { sql } from "./db";
import { logUpdate } from "./audit";
import { MAPPABLE_SOURCE_TYPES, type AttributeChange } from "./source-attributes";

type SrcColumn = { name: string; comment?: string | null };
type SrcTable = { name: string; comment?: string | null; columns: SrcColumn[] };
type SrcSchema = { name: string; tables: SrcTable[] };
type ChangeSink = (entityId: number, entityName: string, schemaId: number, change: AttributeChange) => void;
type Synced = Record<string, { value?: unknown } | undefined>;

/**
 * The comment without the `key: value` pairs (and JSON blocks) that feed mapped fields.
 * Pairs with a key nobody mapped are ordinary text ("Note: see the wiki") and stay.
 */
export function descriptionFromComment(comment: string | null | undefined, mappedKeys: Set<string>): string | null {
  if (!comment) return null;
  let text = comment;
  if (mappedKeys.size > 0) {
    // A JSON object carrying mapped keys is metadata, not prose.
    const json = text.match(/\{[\s\S]*\}/);
    if (json) {
      try {
        const obj = JSON.parse(json[0]);
        if (obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj).some((k) => mappedKeys.has(k.toLowerCase()))) {
          text = text.replace(json[0], " ");
        }
      } catch { /* not JSON — leave it */ }
    }
    // Same shape parseCommentKeyValues() reads: a pair starts the text or follows ; | , newline or ". "
    text = text.replace(/(^|[;|\n,]|\.\s)(\s*)([A-Za-z_][\w-]*)\s*[:=]\s*([^;|\n]+)/g, (whole, lead: string, _sp: string, key: string) =>
      mappedKeys.has(key.toLowerCase()) ? (lead === "\n" ? "\n" : lead.startsWith(".") ? ". " : "") : whole);
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\s*[;|,]\s*([;|,]\s*)+/g, "; ").replace(/\n{3,}/g, "\n\n").trim();
  text = text.replace(/^[;|,.\s]+/, "").replace(/[;|,\s]+$/, "").trim();
  return text || null;
}

export async function applySourceDescriptions(opts: {
  sourceId: number; dbTypeCode: string; schemas: SrcSchema[]; isFirstCrawl: boolean;
  actor: string; log: (msg: string) => Promise<void>; onChange: ChangeSink;
}): Promise<void> {
  if (!opts.schemas.some((s) => s.tables.some((t) => t.comment || t.columns.some((c) => c.comment)))) return;

  // Keys read out of comments for this kind of source, per level.
  const tableKeys = new Set<string>(), columnKeys = new Set<string>();
  if ((MAPPABLE_SOURCE_TYPES as readonly string[]).includes(opts.dbTypeCode)) {
    const custom = await sql<{ key: string; assetType: string }[]>`
      SELECT m.source_key_text AS key, d.asset_type_code AS "assetType"
      FROM bayanat.custom_attribute_source_mappings m
      JOIN bayanat.custom_attribute_definitions d ON d.attr_def_id = m.attr_def_id
      WHERE m.source_type_code = ${opts.dbTypeCode} AND m.method_code = 'COMMENT_KEY' AND d.is_enabled_indicator = true
    `;
    for (const c of custom) (c.assetType === "DATA_ENTITIES" ? tableKeys : columnKeys).add(c.key.toLowerCase());
    const builtin = await sql<{ key: string; field: string }[]>`
      SELECT source_key_text AS key, field_code AS field FROM bayanat.builtin_field_source_mappings
      WHERE source_type_code = ${opts.dbTypeCode} AND method_code = 'COMMENT_KEY'
    `;
    for (const b of builtin) (b.field === "TABLE_TYPE" ? tableKeys : columnKeys).add(b.key.toLowerCase());
  }

  const entities = await sql<{ id: number; schemaId: number; schema: string; name: string; description: string | null; synced: Synced }[]>`
    SELECT e.entity_id AS id, s.schema_id AS "schemaId", s.schema_name_text AS schema, e.entity_name_text AS name,
           e.description_text AS description, e.source_synced_json AS synced
    FROM bayanat.data_entities e JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const entityByName = new Map(entities.map((e) => [`${e.schema}|${e.name}`, e]));
  const attrs = await sql<{ id: number; entityId: number; name: string; description: string | null; synced: Synced }[]>`
    SELECT a.attribute_id AS id, a.entity_id AS "entityId", a.physical_name_text AS name,
           a.description_text AS description, a.source_synced_json AS synced
    FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    WHERE s.data_source_id = ${opts.sourceId}
  `;
  const attrByName = new Map(attrs.map((a) => [`${a.entityId}|${a.name}`, a]));
  const now = new Date().toISOString();
  let written = 0;

  // Returns the description to store, or undefined to leave it untouched.
  const decide = (current: string | null, synced: Synced, fromSource: string | null): { next: string | null; synced: Synced } | undefined => {
    const previous = typeof synced.DESCRIPTION?.value === "string" ? (synced.DESCRIPTION.value as string) : null;
    const empty = current == null || current.trim() === "";
    const untouched = previous != null && current === previous;   // still what a crawl wrote
    if (!empty && !untouched) {
      // A steward's text. If the marker is still there, drop it — it no longer describes the value.
      if (previous == null) return undefined;
      const s = { ...synced }; delete s.DESCRIPTION;
      return { next: current, synced: s };
    }
    if (fromSource == null) return undefined;                      // nothing at the source to write
    if (current === fromSource && previous === fromSource) return undefined;
    return { next: fromSource, synced: { ...synced, DESCRIPTION: { value: fromSource, crawledAt: now } as never } };
  };

  for (const schema of opts.schemas) {
    for (const table of schema.tables) {
      const e = entityByName.get(`${schema.name}|${table.name}`);
      if (!e) continue;
      const entity = { id: Number(e.id), name: e.name, schemaId: Number(e.schemaId) };

      const t = decide(e.description, e.synced ?? {}, descriptionFromComment(table.comment, tableKeys));
      if (t) {
        await sql`UPDATE bayanat.data_entities SET description_text = ${t.next}, source_synced_json = ${sql.json(t.synced as never)} WHERE entity_id = ${entity.id}`;
        if (t.next !== e.description) {
          written++;
          await logUpdate("DATA_ENTITIES", entity.id, opts.actor, [{ field: "description_text", oldVal: e.description, newVal: t.next }]).catch(() => {});
          // A first fill of an empty description is not a change to review; a replaced one is.
          if (!opts.isFirstCrawl && e.description) opts.onChange(entity.id, entity.name, entity.schemaId, { asset: table.name, attrName: "Description", oldValue: e.description, newValue: t.next });
        }
      }

      for (const col of table.columns) {
        const a = attrByName.get(`${entity.id}|${col.name}`);
        if (!a) continue;
        const c = decide(a.description, a.synced ?? {}, descriptionFromComment(col.comment, columnKeys));
        if (!c) continue;
        await sql`UPDATE bayanat.data_attributes SET description_text = ${c.next}, source_synced_json = ${sql.json(c.synced as never)} WHERE attribute_id = ${a.id}`;
        if (c.next !== a.description) {
          written++;
          await logUpdate("DATA_ATTRIBUTES", Number(a.id), opts.actor, [{ field: "description_text", oldVal: a.description, newVal: c.next }]).catch(() => {});
          if (!opts.isFirstCrawl && a.description) opts.onChange(entity.id, entity.name, entity.schemaId, { asset: `${table.name}.${col.name}`, attrName: "Description", oldValue: a.description, newValue: c.next });
        }
      }
    }
  }
  if (written > 0) await opts.log(`Descriptions from source comments: ${written} filled or updated`);
}
