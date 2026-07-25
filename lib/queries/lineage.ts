import { sql } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LineageScopeCode = "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";
export type LineageAssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";
export type LineageQualityStatus = "CRITICAL" | "WARNING" | "GOOD" | "UNKNOWN";
export type LineageLayerCode = "SOURCE" | "RAW" | "STAGING" | "TABLE" | "VIEW" | "DASHBOARD";

export type ImpactAssetRow = {
  depth:                    number;
  lineageId:                number;
  assetId:                  number;
  assetType:                LineageAssetType;
  name:                     string;
  parentEntityName:         string | null;
  schemaName:               string | null;
  sourceName:               string | null;
  layerCode:                LineageLayerCode | null;
  ownerName:                string | null;
  qualityStatus:            LineageQualityStatus;
  dqTagCount:                number;
  transformationTypeCode:   string | null;
  transformationTypeName:   string | null;
  transformationLogicText:  string | null;
  processName:              string | null;
};

export type ImpactReport = {
  summary: {
    totalImpacted: number;
    byLayer:       Record<string, number>;
    withDqIssues:  number;
  };
  levels: { depth: number; assets: ImpactAssetRow[] }[];
};

const scopeForAssetType = (assetType: LineageAssetType): LineageScopeCode =>
  assetType === "DATA_ENTITIES" ? "ENTITY_LEVEL" : "ATTRIBUTE_LEVEL";

// ── Internal: resolve raw traversal rows into full asset + edge detail ────────

type RawImpactRow = { depth: number; assetId: number; lineageId: number; transformationLogicText: string | null };

async function resolveImpactAssets(rows: RawImpactRow[], assetType: LineageAssetType): Promise<ImpactAssetRow[]> {
  if (rows.length === 0) return [];

  const assetIds   = [...new Set(rows.map(r => r.assetId))];
  const lineageIds = [...new Set(rows.map(r => r.lineageId))];

  const edgeRows = await sql<{
    lineageId: number; transformationTypeCode: string | null; transformationTypeName: string | null; processName: string | null;
  }[]>`
    SELECT
      dl.lineage_id                             AS "lineageId",
      dl.transformation_type_code               AS "transformationTypeCode",
      tt.transformation_type_name_text          AS "transformationTypeName",
      lp.process_name                           AS "processName"
    FROM bayanat.data_lineage dl
    LEFT JOIN bayanat.lineage_transformation_types tt ON tt.transformation_type_code = dl.transformation_type_code
    LEFT JOIN bayanat.lineage_processes lp ON lp.process_id = dl.process_id
    WHERE dl.lineage_id = ANY(${lineageIds})
  `;
  const edgeByLineageId = new Map(edgeRows.map(e => [Number(e.lineageId), e]));

  type AssetDetail = {
    assetId: number; name: string; parentEntityName: string | null; schemaName: string | null;
    sourceName: string | null; layerCode: LineageLayerCode | null; ownerName: string | null;
    qualityStatus: LineageQualityStatus; dqTagCount: number;
  };

  const assetRows: AssetDetail[] = assetType === "DATA_ENTITIES"
    ? await sql`
        SELECT
          e.entity_id                             AS "assetId",
          e.entity_name_text                      AS "name",
          NULL::text                               AS "parentEntityName",
          s.schema_name_text                      AS "schemaName",
          src.source_name_text                    AS "sourceName",
          e.layer_code                            AS "layerCode",
          owner.full_name                         AS "ownerName",
          COALESCE(qual.status, 'UNKNOWN')        AS "qualityStatus",
          (SELECT COUNT(*)::int FROM bayanat.asset_tags at WHERE at.asset_type_code = 'DATA_ENTITIES' AND at.asset_id = e.entity_id) AS "dqTagCount"
        FROM bayanat.data_entities e
        LEFT JOIN bayanat.data_schemas s   ON s.schema_id = e.schema_id
        LEFT JOIN bayanat.data_sources src ON src.data_source_id = s.data_source_id
        LEFT JOIN LATERAL (
          SELECT u.full_name FROM bayanat.asset_stakeholders st
          JOIN bayanat.users u ON u.user_id = st.user_id
          WHERE st.asset_type_code = 'DATA_ENTITIES' AND st.asset_id = e.entity_id
          ORDER BY CASE WHEN st.role_code = 'OWNER' THEN 0 ELSE 1 END
          LIMIT 1
        ) owner ON true
        -- Entity quality rolls up worst-of: rules directly on the entity, plus rules on any of its columns.
        LEFT JOIN LATERAL (
          SELECT
            CASE
              WHEN bool_or(r.severity_level_code = 'CRITICAL' AND r.last_status_code = 'FAILED') THEN 'CRITICAL'
              WHEN bool_or(r.severity_level_code = 'WARNING'  AND r.last_status_code = 'FAILED') THEN 'WARNING'
              WHEN COUNT(*) > 0 THEN 'GOOD'
              ELSE 'UNKNOWN'
            END AS status
          FROM bayanat.dq_rules r
          WHERE r.is_active_indicator = true
            AND (
              (r.asset_type_code = 'DATA_ENTITIES' AND r.asset_id = e.entity_id)
              OR (r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id IN (
                SELECT da.attribute_id FROM bayanat.data_attributes da WHERE da.entity_id = e.entity_id
              ))
            )
        ) qual ON true
        WHERE e.entity_id = ANY(${assetIds})
      `
    : await sql`
        SELECT
          a.attribute_id                          AS "assetId",
          a.physical_name_text                    AS "name",
          e.entity_name_text                      AS "parentEntityName",
          s.schema_name_text                      AS "schemaName",
          src.source_name_text                    AS "sourceName",
          e.layer_code                            AS "layerCode",
          owner.full_name                         AS "ownerName",
          CASE
            WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true AND r.severity_level_code = 'CRITICAL' AND r.last_status_code = 'FAILED')
              THEN 'CRITICAL'
            WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true AND r.severity_level_code = 'WARNING' AND r.last_status_code = 'FAILED')
              THEN 'WARNING'
            WHEN EXISTS (SELECT 1 FROM bayanat.dq_rules r WHERE r.asset_type_code = 'DATA_ATTRIBUTES' AND r.asset_id = a.attribute_id AND r.is_active_indicator = true)
              THEN 'GOOD'
            ELSE 'UNKNOWN'
          END                                      AS "qualityStatus",
          (SELECT COUNT(*)::int FROM bayanat.asset_tags at WHERE at.asset_type_code = 'DATA_ATTRIBUTES' AND at.asset_id = a.attribute_id) AS "dqTagCount"
        FROM bayanat.data_attributes a
        JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        LEFT JOIN bayanat.data_schemas s   ON s.schema_id = e.schema_id
        LEFT JOIN bayanat.data_sources src ON src.data_source_id = s.data_source_id
        LEFT JOIN LATERAL (
          SELECT u.full_name FROM bayanat.asset_stakeholders st
          JOIN bayanat.users u ON u.user_id = st.user_id
          WHERE st.asset_type_code = 'DATA_ATTRIBUTES' AND st.asset_id = a.attribute_id
          ORDER BY CASE WHEN st.role_code = 'OWNER' THEN 0 ELSE 1 END
          LIMIT 1
        ) owner ON true
        WHERE a.attribute_id = ANY(${assetIds})
      `;

  const assetById = new Map(assetRows.map(a => [Number(a.assetId), a]));

  return rows.map(r => {
    const asset = assetById.get(r.assetId);
    const edge  = edgeByLineageId.get(r.lineageId);
    return {
      depth:                    r.depth,
      lineageId:                r.lineageId,
      assetId:                  r.assetId,
      assetType,
      name:                     asset?.name ?? "Unknown",
      parentEntityName:         asset?.parentEntityName ?? null,
      schemaName:               asset?.schemaName ?? null,
      sourceName:               asset?.sourceName ?? null,
      layerCode:                asset?.layerCode ?? null,
      ownerName:                asset?.ownerName ?? null,
      qualityStatus:            asset?.qualityStatus ?? "UNKNOWN",
      dqTagCount:               asset?.dqTagCount ?? 0,
      transformationTypeCode:   edge?.transformationTypeCode ?? null,
      transformationTypeName:   edge?.transformationTypeName ?? null,
      transformationLogicText:  r.transformationLogicText,
      processName:              edge?.processName ?? null,
    };
  });
}

function buildReport(assets: ImpactAssetRow[]): ImpactReport {
  const distinctAssetIds = new Set(assets.map(a => a.assetId));
  const byLayer: Record<string, number> = {};
  const dqAssetIds = new Set<number>();
  for (const id of distinctAssetIds) {
    const a = assets.find(x => x.assetId === id)!;
    const layer = a.layerCode ?? "UNKNOWN";
    byLayer[layer] = (byLayer[layer] ?? 0) + 1;
    if (a.qualityStatus === "CRITICAL" || a.qualityStatus === "WARNING") dqAssetIds.add(id);
  }

  const byDepth = new Map<number, ImpactAssetRow[]>();
  for (const a of assets) {
    const arr = byDepth.get(a.depth) ?? [];
    arr.push(a);
    byDepth.set(a.depth, arr);
  }
  const levels = [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, rowsAtDepth]) => ({ depth, assets: rowsAtDepth }));

  return {
    summary: {
      totalImpacted: distinctAssetIds.size,
      byLayer,
      withDqIssues: dqAssetIds.size,
    },
    levels,
  };
}

// ── Public traversal queries ────────────────────────────────────────────────

export async function getDownstreamImpact(assetType: LineageAssetType, assetId: number, maxDepth = 10): Promise<ImpactReport> {
  const scope = scopeForAssetType(assetType);
  const raw = await sql<RawImpactRow[]>`
    SELECT
      impact_level         AS "depth",
      downstream_asset_id  AS "assetId",
      lineage_id           AS "lineageId",
      transformation_logic AS "transformationLogicText"
    FROM bayanat.fn_get_downstream_impact(${assetId}, ${scope}, ${maxDepth})
  `;
  const resolved = await resolveImpactAssets(raw, assetType);
  return buildReport(resolved);
}

export async function getUpstreamImpact(assetType: LineageAssetType, assetId: number, maxDepth = 10): Promise<ImpactReport> {
  const scope = scopeForAssetType(assetType);
  const raw = await sql<RawImpactRow[]>`
    SELECT
      impact_level       AS "depth",
      upstream_asset_id  AS "assetId",
      lineage_id         AS "lineageId",
      transformation_logic AS "transformationLogicText"
    FROM bayanat.fn_get_upstream_impact(${assetId}, ${scope}, ${maxDepth})
  `;
  const resolved = await resolveImpactAssets(raw, assetType);
  return buildReport(resolved);
}
