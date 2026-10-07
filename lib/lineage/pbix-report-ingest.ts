// Catalogs a .pbix report's pages and visuals next to its semantic model, and draws the
// lineage through them:
//   model table ─▶ visual ("analysis") ─▶ page          (entity level)
//   model column / measure ─▶ the visual's field         (attribute level)
// A visual is cataloged as "<page> › <visual title>" with one attribute per field it
// shows; visuals that read no data (text boxes, shapes, images) are left out.
import { sql } from "../db";
import { ensureAttribute } from "./catalog-upsert";
import { ensureEntityByExternalId, ensureProcess, upsertLineageEdge } from "./powerbi-ingester";
import type { ReportPage } from "./pbix-report-layout";

const SYSTEM = "POWERBI";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function uniqueName(base: string, taken: Set<string>): string {
  let name = base, i = 2;
  while (taken.has(name.toLowerCase())) name = `${base} (${i++})`;
  taken.add(name.toLowerCase());
  return name;
}

export async function ingestPbixReportPages(o: {
  pages: ReportPage[]; datasetId: string; datasetName: string; connectionId: number; fileName: string;
}): Promise<{ pages: number; visuals: number; fields: number; edgesCreated: number; warnings: string[] }> {
  const warnings: string[] = [];
  let edgesCreated = 0, visualCount = 0, fieldCount = 0, pageCount = 0;

  // The semantic model's tables, as the model ingest just cataloged them.
  const modelTables = await sql<{ entityId: number; schemaId: number; ext: string }[]>`
    SELECT x.asset_id AS "entityId", e.schema_id AS "schemaId", x.external_id_text AS ext
    FROM bayanat.asset_external_ids x JOIN bayanat.data_entities e ON e.entity_id = x.asset_id
    WHERE x.system_code = ${SYSTEM} AND x.asset_type_code = 'DATA_ENTITIES'
      AND x.external_id_text LIKE ${o.datasetId.replace(/[\\%_]/g, "\\$&") + "/%"}
      AND e.object_type_code = 'SEMANTIC_MODEL'
  `;
  if (modelTables.length === 0) return { pages: 0, visuals: 0, fields: 0, edgesCreated: 0, warnings: ["Report pages skipped: the semantic model's tables were not cataloged."] };
  const schemaId = modelTables[0].schemaId;
  const tableEntity = new Map(modelTables.map((t) => [t.ext.slice(o.datasetId.length + 1).toLowerCase(), t.entityId]));
  const attrCache = new Map<number, Map<string, number>>();
  const attrsOf = async (entityId: number) => {
    if (!attrCache.has(entityId)) {
      const rows = await sql<{ id: number; name: string }[]>`SELECT attribute_id AS id, physical_name_text AS name FROM bayanat.data_attributes WHERE entity_id = ${entityId}`;
      attrCache.set(entityId, new Map(rows.map((r) => [r.name.toLowerCase(), r.id])));
    }
    return attrCache.get(entityId)!;
  };

  const { id: processId } = await ensureProcess(o.connectionId, "PBI_REPORT", `${o.datasetName} (report pages)`, `pbix-report:${o.fileName}`, "Report pages and their visuals reading the semantic model");

  const seen = new Set<string>();
  const pageNames = new Set<string>();
  const unresolved = new Set<string>();

  for (const page of o.pages) {
    const visuals = page.visuals.filter((v) => v.fields.length > 0);
    if (visuals.length === 0) continue;
    const pageName = uniqueName(page.name.trim() || "Page", pageNames);
    const pageExt = `${o.datasetId}/page/${page.id}`;
    const pageEntityId = await ensureEntityByExternalId(SYSTEM, pageExt, schemaId, clip(`Page: ${pageName}`, 100), "REPORT_PAGE", pageName);
    seen.add(pageExt); pageCount++;

    const visualNames = new Set<string>();
    for (const v of visuals) {
      // Untitled visuals are named after what they show ("Column chart — Count of ID, Parent Name").
      const shown = [...new Set(v.fields.map((f) => f.label))];
      const visualName = uniqueName(v.title ?? `${v.typeLabel} — ${shown.slice(0, 2).join(", ")}${shown.length > 2 ? "…" : ""}`, visualNames);
      const ext = `${o.datasetId}/visual/${page.id}/${v.id}`;
      const entityId = await ensureEntityByExternalId(SYSTEM, ext, schemaId, clip(`${pageName} › ${visualName}`, 100), "REPORT_VISUAL", `${pageName} › ${visualName}`);
      await sql`
        UPDATE bayanat.data_entities SET entity_name_text = ${clip(`${pageName} › ${visualName}`, 100)}, display_name_text = ${clip(`${pageName} › ${visualName}`, 255)}
        WHERE entity_id = ${entityId} AND entity_name_text <> ${clip(`${pageName} › ${visualName}`, 100)}
      `;
      await sql`UPDATE bayanat.data_entities SET description_text = ${`${v.typeLabel} on the "${pageName}" page of the report ${o.datasetName}.`} WHERE entity_id = ${entityId} AND description_text IS NULL`;
      seen.add(ext); visualCount++;

      // Model tables the visual reads (through its fields or only through its filters).
      const tables = new Set([...v.fields.map((f) => f.table), ...v.filterTables]);
      for (const t of tables) {
        const src = tableEntity.get(t.toLowerCase());
        if (!src) continue;
        await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: src, targetAssetId: entityId, transformationTypeCode: "DIRECT", transformationLogicText: `${v.typeLabel} "${visualName}" (page ${pageName}) reads model table ${t}`, processId, confidenceCode: "HIGH", connectionId: o.connectionId });
        edgesCreated++;
      }
      await upsertLineageEdge({ scope: "ENTITY_LEVEL", sourceAssetId: entityId, targetAssetId: pageEntityId, transformationTypeCode: "DIRECT", transformationLogicText: `${v.typeLabel} "${visualName}" is shown on page ${pageName}`, processId, confidenceCode: "HIGH", connectionId: o.connectionId });
      edgesCreated++;

      // One attribute per field the visual shows, fed by the model column / measure.
      const fieldNames = new Set<string>();
      const fieldAttrs: { attrId: number; srcAttr: number | undefined }[] = [];
      for (const f of v.fields) {
        const srcEntity = tableEntity.get(f.table.toLowerCase());
        const srcAttr = srcEntity ? (await attrsOf(srcEntity)).get(f.name.toLowerCase()) : undefined;
        const label = clip(f.label, 100);
        if (fieldNames.has(label.toLowerCase())) continue; // the same field in two wells
        fieldNames.add(label.toLowerCase());
        const dataType = f.kind === "measure" ? "measure" : f.aggregation ? clip(`${f.aggregation.toLowerCase()} of column`, 50) : "column";
        const attrId = await ensureAttribute(entityId, label, dataType, f.kind === "measure" ? { attributeClassCode: "MEASURE" } : {});
        fieldCount++;
        fieldAttrs.push({ attrId, srcAttr });
        if (!srcAttr) { unresolved.add(`${f.table}[${f.name}]`); continue; }
        await upsertLineageEdge({
          scope: "ATTRIBUTE_LEVEL", sourceAssetId: srcAttr, targetAssetId: attrId,
          transformationTypeCode: f.aggregation ? "AGGREGATION" : "DIRECT",
          transformationLogicText: `${f.role ? `${f.role}: ` : ""}${f.aggregation ? `${f.aggregation} of ` : ""}${f.table}[${f.name}]`,
          processId, confidenceCode: "HIGH", connectionId: o.connectionId,
        });
        edgesCreated++;
      }

      // Filters set on the visual: the filtered column doesn't supply any field's value,
      // it decides which rows every field is computed over.
      for (const flt of v.filters) {
        const fltEntity = tableEntity.get(flt.table.toLowerCase());
        const fltAttr = fltEntity ? (await attrsOf(fltEntity)).get(flt.name.toLowerCase()) : undefined;
        if (!fltAttr) continue;
        for (const fa of fieldAttrs) {
          if (fa.srcAttr === fltAttr) continue; // already the field's value
          await upsertLineageEdge({
            scope: "ATTRIBUTE_LEVEL", sourceAssetId: fltAttr, targetAssetId: fa.attrId, transformationTypeCode: "FILTER",
            transformationLogicText: `Visual filter on ${flt.table}[${flt.name}]`, processId, confidenceCode: "HIGH", connectionId: o.connectionId,
          });
          edgesCreated++;
        }
      }
    }
  }
  if (unresolved.size > 0) {
    const list = [...unresolved];
    warnings.push(`Report pages: ${list.length} field(s) used by visuals belong to tables that were not found in the semantic model read from the file — listed on the visual, not linked: ${list.slice(0, 8).join(", ")}${list.length > 8 ? ` and ${list.length - 8} more` : ""}.`);
  }

  // Pages / visuals removed from the report since the last scan.
  const prefix = o.datasetId.replace(/[\\%_]/g, "\\$&");
  const known = await sql<{ entityId: number; ext: string }[]>`
    SELECT asset_id AS "entityId", external_id_text AS ext FROM bayanat.asset_external_ids
    WHERE system_code = ${SYSTEM} AND asset_type_code = 'DATA_ENTITIES'
      AND (external_id_text LIKE ${prefix + "/page/%"} OR external_id_text LIKE ${prefix + "/visual/%"})
  `;
  for (const k of known.filter((x) => !seen.has(x.ext))) {
    try {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM bayanat.asset_external_ids WHERE system_code = ${SYSTEM} AND asset_type_code = 'DATA_ENTITIES' AND asset_id = ${k.entityId}`;
        await tx`DELETE FROM bayanat.data_entities WHERE entity_id = ${k.entityId}`;
      });
    } catch { /* still referenced elsewhere (e.g. manual lineage) — keep it */ }
  }

  return { pages: pageCount, visuals: visualCount, fields: fieldCount, edgesCreated, warnings };
}
