import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { FullSearchHit, SearchResponse } from "@/lib/search-types";
import { ALL_TYPES } from "@/lib/search-types";

export type { FullSearchHit, SearchResponse };
export { ALL_TYPES };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ counts: {}, total: 0, results: [] } satisfies SearchResponse);

  const typesRaw   = searchParams.get("types");
  const stakeholderRaw = searchParams.get("stakeholders");
  const tagRaw     = searchParams.get("tags");

  const activeTypes    = new Set<string>(typesRaw ? typesRaw.split(",") : ALL_TYPES);
  const stakeholderIds = stakeholderRaw ? stakeholderRaw.split(",").filter(Boolean) : [];
  const tagIds         = tagRaw ? tagRaw.split(",").map(Number).filter((n) => !isNaN(n) && n > 0) : [];

  const like = `%${q}%`;
  const results: FullSearchHit[] = [];

  // ── TABLE / VIEW ────────────────────────────────────────────────────────
  if (activeTypes.has("TABLE") || activeTypes.has("VIEW")) {
    const entityRows = await sql<{
      entityId: number; name: string; desc: string | null;
      isView: boolean; rowCount: bigint | null;
      schemaId: number; schemaName: string; sourceName: string;
    }[]>`
      SELECT
        e.entity_id           AS "entityId",
        e.entity_name_text    AS name,
        e.description_text    AS desc,
        e.is_view_indicator   AS "isView",
        e.row_count_estimate  AS "rowCount",
        s.schema_id           AS "schemaId",
        s.schema_name_text    AS "schemaName",
        ds.source_name_text   AS "sourceName"
      FROM bayanat.data_entities e
      JOIN bayanat.data_schemas  s  ON s.schema_id      = e.schema_id
      JOIN bayanat.data_sources  ds ON ds.data_source_id = s.data_source_id
      WHERE (
        e.entity_name_text  ILIKE ${like}
        OR e.display_name_text ILIKE ${like}
        OR e.description_text  ILIKE ${like}
      )
      ${stakeholderIds.length > 0
        ? sql`AND e.entity_id IN (
            SELECT asset_id FROM bayanat.asset_stakeholders
            WHERE asset_type_code = 'DATA_ENTITIES'
              AND user_id = ANY(${stakeholderIds})
          )`
        : sql``}
      ${tagIds.length > 0
        ? sql`AND e.entity_id IN (
            SELECT asset_id FROM bayanat.asset_tags
            WHERE asset_type_code = 'DATA_ENTITIES'
              AND tag_id = ANY(${tagIds})
          )`
        : sql``}
      ORDER BY e.entity_name_text
      LIMIT 60
    `;

    const filtered = entityRows.filter((e) =>
      (e.isView && activeTypes.has("VIEW")) || (!e.isView && activeTypes.has("TABLE"))
    );

    if (filtered.length > 0) {
      const entityIds = filtered.map((e) => e.entityId);

      const [tagRows, stewardRows] = await Promise.all([
        sql<{ assetId: number; tagId: number; tagName: string; colorHex: string | null }[]>`
          SELECT at2.asset_id AS "assetId", t.tag_id AS "tagId",
                 t.tag_name AS "tagName", t.color_hex AS "colorHex"
          FROM bayanat.asset_tags at2
          JOIN bayanat.tags t ON t.tag_id = at2.tag_id
          WHERE at2.asset_type_code = 'DATA_ENTITIES'
            AND at2.asset_id = ANY(${entityIds})
        `,
        sql<{ assetId: number; userId: string; fullName: string; roleCode: string }[]>`
          SELECT ast.asset_id AS "assetId", ast.user_id AS "userId",
                 u.full_name AS "fullName", ast.role_code AS "roleCode"
          FROM bayanat.asset_stakeholders ast
          JOIN bayanat.users u ON u.user_id = ast.user_id
          WHERE ast.asset_type_code = 'DATA_ENTITIES'
            AND ast.asset_id = ANY(${entityIds})
        `,
      ]);

      const tagsByEntity = new Map<number, { tagId: number; tagName: string; colorHex: string | null }[]>();
      for (const t of tagRows) {
        const list = tagsByEntity.get(t.assetId) ?? [];
        list.push({ tagId: t.tagId, tagName: t.tagName, colorHex: t.colorHex });
        tagsByEntity.set(t.assetId, list);
      }

      const stewardsByEntity = new Map<number, { userId: string; fullName: string; roleCode: string }[]>();
      for (const s of stewardRows) {
        const list = stewardsByEntity.get(s.assetId) ?? [];
        list.push({ userId: s.userId, fullName: s.fullName, roleCode: s.roleCode });
        stewardsByEntity.set(s.assetId, list);
      }

      for (const e of filtered) {
        results.push({
          type:        e.isView ? "VIEW" : "TABLE",
          id:          e.entityId,
          name:        e.name,
          description: e.desc,
          href:        `/catalog/${e.schemaId}/tables/${e.entityId}`,
          path:        [e.sourceName, e.schemaName],
          rowCount:    e.rowCount != null ? Number(e.rowCount) : null,
          schemaName:  e.schemaName,
          sourceName:  e.sourceName,
          isView:      e.isView,
          tags:        tagsByEntity.get(e.entityId) ?? [],
          stewards:    stewardsByEntity.get(e.entityId) ?? [],
        });
      }
    }
  }

  // ── COLUMN ──────────────────────────────────────────────────────────────
  if (activeTypes.has("COLUMN")) {
    const colRows = await sql<{
      attrId: number; name: string; desc: string | null;
      dataType: string | null;
      entityId: number; entityName: string;
      schemaId: number; schemaName: string; sourceName: string;
    }[]>`
      SELECT
        a.attribute_id        AS "attrId",
        a.physical_name_text  AS name,
        a.description_text    AS desc,
        a.data_type_text      AS "dataType",
        e.entity_id           AS "entityId",
        e.entity_name_text    AS "entityName",
        s.schema_id           AS "schemaId",
        s.schema_name_text    AS "schemaName",
        ds.source_name_text   AS "sourceName"
      FROM bayanat.data_attributes a
      JOIN bayanat.data_entities e  ON e.entity_id      = a.entity_id
      JOIN bayanat.data_schemas  s  ON s.schema_id      = e.schema_id
      JOIN bayanat.data_sources  ds ON ds.data_source_id = s.data_source_id
      WHERE (
        a.physical_name_text ILIKE ${like}
        OR a.friendly_name_text ILIKE ${like}
        OR a.description_text   ILIKE ${like}
      )
      ${stakeholderIds.length > 0
        ? sql`AND e.entity_id IN (
            SELECT asset_id FROM bayanat.asset_stakeholders
            WHERE asset_type_code = 'DATA_ENTITIES'
              AND user_id = ANY(${stakeholderIds})
          )`
        : sql``}
      ${tagIds.length > 0
        ? sql`AND e.entity_id IN (
            SELECT asset_id FROM bayanat.asset_tags
            WHERE asset_type_code = 'DATA_ENTITIES'
              AND tag_id = ANY(${tagIds})
          )`
        : sql``}
      ORDER BY a.physical_name_text
      LIMIT 60
    `;

    for (const c of colRows) {
      results.push({
        type:        "COLUMN",
        id:          c.attrId,
        name:        c.name,
        description: c.desc,
        href:        `/catalog/${c.schemaId}/tables/${c.entityId}`,
        path:        [c.sourceName, c.schemaName, c.entityName],
        dataType:    c.dataType,
        tableName:   c.entityName,
        schemaName:  c.schemaName,
        sourceName:  c.sourceName,
        tags:        [],
        stewards:    [],
      });
    }
  }

  // ── SCHEMA ──────────────────────────────────────────────────────────────
  if (activeTypes.has("SCHEMA") && stakeholderIds.length === 0 && tagIds.length === 0) {
    const schemaRows = await sql<{
      schemaId: number; name: string; desc: string | null; sourceName: string;
    }[]>`
      SELECT s.schema_id AS "schemaId", s.schema_name_text AS name,
             s.description_text AS desc, ds.source_name_text AS "sourceName"
      FROM bayanat.data_schemas s
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      WHERE s.schema_name_text ILIKE ${like} OR s.description_text ILIKE ${like}
      ORDER BY s.schema_name_text LIMIT 20
    `;
    for (const s of schemaRows) {
      results.push({
        type: "SCHEMA", id: s.schemaId, name: s.name, description: s.desc,
        href: `/catalog/${s.schemaId}`, path: [s.sourceName],
        sourceName: s.sourceName, tags: [], stewards: [],
      });
    }
  }

  // ── SOURCE ──────────────────────────────────────────────────────────────
  if (activeTypes.has("SOURCE") && stakeholderIds.length === 0 && tagIds.length === 0) {
    const sourceRows = await sql<{
      sourceId: number; name: string; desc: string | null;
    }[]>`
      SELECT data_source_id AS "sourceId", source_name_text AS name, description_text AS desc
      FROM bayanat.data_sources
      WHERE source_name_text ILIKE ${like} OR description_text ILIKE ${like}
      ORDER BY source_name_text LIMIT 10
    `;
    for (const s of sourceRows) {
      results.push({
        type: "SOURCE", id: s.sourceId, name: s.name, description: s.desc,
        href: `/catalog`, path: [], tags: [], stewards: [],
      });
    }
  }

  // ── TERM ────────────────────────────────────────────────────────────────
  if (activeTypes.has("TERM") && stakeholderIds.length === 0 && tagIds.length === 0) {
    const termRows = await sql<{
      termId: number; name: string; desc: string | null; classification: string | null;
    }[]>`
      SELECT glossary_id AS "termId", term_name_text AS name,
             definition_text AS desc, classification_code AS classification
      FROM bayanat.business_glossaries
      WHERE term_name_text ILIKE ${like} OR definition_text ILIKE ${like}
      ORDER BY term_name_text LIMIT 20
    `;
    for (const t of termRows) {
      results.push({
        type: "TERM", id: t.termId, name: t.name, description: t.desc,
        href: `/glossary/${t.termId}`, path: [],
        classification: t.classification ?? undefined,
        tags: [], stewards: [],
      });
    }
  }

  const counts: Partial<Record<FullSearchHit["type"], number>> = {};
  for (const r of results) counts[r.type] = (counts[r.type] ?? 0) + 1;

  return NextResponse.json({ counts, total: results.length, results } satisfies SearchResponse);
}
