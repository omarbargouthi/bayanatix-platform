import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("assetType");
  const assetIdRaw = searchParams.get("assetId");

  if (!assetType || !assetIdRaw) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const assetId = Number(assetIdRaw);
  if (!Number.isFinite(assetId)) {
    return NextResponse.json({ error: "Invalid assetId" }, { status: 400 });
  }

  const [entityRows, termRows, tagRows, dqRows, requestRows, stewardRows, lineageRows] =
    await Promise.all([
      sql<{ id: number; name: string; rowCount: number | null; isView: boolean; description: string | null }[]>`
        SELECT
          entity_id           AS id,
          entity_name_text    AS name,
          row_count_estimate  AS "rowCount",
          is_view_indicator   AS "isView",
          description_text    AS description
        FROM bayanat.data_entities
        WHERE entity_id = ${assetId}
        LIMIT 1
      `,

      sql<{ id: number; label: string; meta: string | null }[]>`
        SELECT
          abt.abt_id          AS id,
          bg.term_name_text   AS label,
          bg.classification_code AS meta
        FROM bayanat.asset_business_terms abt
        JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
        WHERE abt.asset_type_code = ${assetType}
          AND abt.asset_id = ${assetId}
      `,

      sql<{ id: number; label: string; meta: string | null }[]>`
        SELECT
          at2.asset_tag_id    AS id,
          t.tag_name          AS label,
          t.color_hex         AS meta
        FROM bayanat.asset_tags at2
        JOIN bayanat.tags t ON t.tag_id = at2.tag_id
        WHERE at2.asset_type_code = ${assetType}
          AND at2.asset_id = ${assetId}
      `,

      sql<{ id: number; label: string; meta: string | null }[]>`
        SELECT
          rule_id             AS id,
          rule_name_text      AS label,
          last_status_code    AS meta
        FROM bayanat.dq_rules
        WHERE asset_type_code = ${assetType}
          AND asset_id = ${assetId}
      `,

      sql<{ id: number; label: string; meta: string | null; requestId: number }[]>`
        SELECT
          art.target_id                                           AS id,
          ar.title                                                AS label,
          CONCAT(ar.request_type_code, ' · ', ar.status_code)    AS meta,
          ar.request_id                                           AS "requestId"
        FROM bayanat.asset_request_targets art
        JOIN bayanat.asset_requests ar ON ar.request_id = art.request_id
        WHERE art.asset_type_code = ${assetType}
          AND art.asset_id = ${assetId}
      `,

      sql<{ id: number; label: string; meta: string | null }[]>`
        SELECT
          ast.assignment_id   AS id,
          u.full_name         AS label,
          ast.role_code       AS meta
        FROM bayanat.asset_stakeholders ast
        JOIN bayanat.users u ON u.user_id = ast.user_id
        WHERE ast.asset_type_code = ${assetType}
          AND ast.asset_id = ${assetId}
      `,

      sql<{ id: number; label: string | null; direction: string }[]>`
        SELECT
          dl.lineage_id       AS id,
          CASE
            WHEN dl.source_asset_id = ${assetId} THEN te.entity_name_text
            ELSE se.entity_name_text
          END                 AS label,
          CASE
            WHEN dl.source_asset_id = ${assetId} THEN 'downstream'
            ELSE 'upstream'
          END                 AS direction
        FROM bayanat.data_lineage dl
        LEFT JOIN bayanat.data_entities se ON se.entity_id = dl.source_asset_id
        LEFT JOIN bayanat.data_entities te ON te.entity_id = dl.target_asset_id
        WHERE (dl.source_asset_id = ${assetId} OR dl.target_asset_id = ${assetId})
      `,
    ]);

  if (entityRows.length === 0) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const asset = entityRows[0];

  const groups = [
    {
      id: "terms",
      label: "Business Terms",
      color: "#7c3aed",
      items: termRows.map((r) => ({ id: String(r.id), label: r.label, meta: r.meta ?? undefined })),
    },
    {
      id: "tags",
      label: "Tags",
      color: "#3b82f6",
      items: tagRows.map((r) => ({ id: String(r.id), label: r.label, meta: r.meta ?? undefined })),
    },
    {
      id: "dq",
      label: "DQ Rules",
      color: "#f59e0b",
      items: dqRows.map((r) => ({ id: String(r.id), label: r.label, meta: r.meta ?? undefined })),
    },
    {
      id: "requests",
      label: "Requests",
      color: "#ef4444",
      items: requestRows.map((r) => ({
        id: String(r.id),
        label: r.label,
        meta: r.meta ?? undefined,
        href: `/requests/${r.requestId}`,
      })),
    },
    {
      id: "stewards",
      label: "Stewards",
      color: "#10b981",
      items: stewardRows.map((r) => ({ id: String(r.id), label: r.label, meta: r.meta ?? undefined })),
    },
    {
      id: "lineage",
      label: "Lineage",
      color: "#6366f1",
      items: lineageRows.map((r) => ({
        id: String(r.id),
        label: r.label ?? "Unknown",
        meta: r.direction,
      })),
    },
  ];

  return NextResponse.json({ asset, groups });
}
