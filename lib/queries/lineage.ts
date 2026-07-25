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

// ── Graph (for the lineage UI) ──────────────────────────────────────────────

export type LineageGraphNode = {
  entityId:          number;
  entityName:        string;
  layerCode:         LineageLayerCode | null;
  schemaName:        string | null;
  sourceName:        string | null;
  ownerName:         string | null;
  qualityStatus:     LineageQualityStatus;
  dqTagCount:        number;
  columnCount:       number;
  isCurrent:         boolean;
  hasUpstreamIssue:  boolean; // FR-4.4: any upstream node in this graph is CRITICAL/WARNING
  // Columns touched by an edge in this graph (attribute-level scope only) — the
  // Figma's "focused column" subtitle + expandable "N columns" list.
  columns: { attributeId: number; name: string }[];
};

export type LineageGraphEdge = {
  lineageId:                number;
  sourceEntityId:           number;
  targetEntityId:           number;
  sourceColumnName:         string | null;
  targetColumnName:         string | null;
  transformationTypeCode:   string | null;
  transformationTypeName:   string | null;
  transformationLogicText:  string | null;
  processName:              string | null;
  provenanceCode:           string;
  isConfirmed:               boolean;
  confidenceCode:           string | null;
};

export type LineageGraph = {
  focus:  { assetType: LineageAssetType; assetId: number; entityId: number; name: string; columnName: string | null };
  nodes:  LineageGraphNode[];
  edges:  LineageGraphEdge[];
  counts: { upstreamTotal: number; downstreamTotal: number };
};

async function resolveEntityNodes(entityIds: number[], currentEntityId: number): Promise<Map<number, LineageGraphNode>> {
  if (entityIds.length === 0) return new Map();
  const rows = await sql<{
    entityId: number; entityName: string; layerCode: LineageLayerCode | null;
    schemaName: string | null; sourceName: string | null; ownerName: string | null;
    qualityStatus: LineageQualityStatus; dqTagCount: number; columnCount: number;
  }[]>`
    SELECT
      e.entity_id                               AS "entityId",
      e.entity_name_text                        AS "entityName",
      e.layer_code                              AS "layerCode",
      s.schema_name_text                        AS "schemaName",
      src.source_name_text                      AS "sourceName",
      owner.full_name                           AS "ownerName",
      COALESCE(qual.status, 'UNKNOWN')          AS "qualityStatus",
      (SELECT COUNT(*)::int FROM bayanat.asset_tags at WHERE at.asset_type_code = 'DATA_ENTITIES' AND at.asset_id = e.entity_id) AS "dqTagCount",
      (SELECT COUNT(*)::int FROM bayanat.data_attributes da WHERE da.entity_id = e.entity_id) AS "columnCount"
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
    WHERE e.entity_id = ANY(${entityIds})
  `;
  return new Map(rows.map((r) => [
    Number(r.entityId),
    {
      entityId: Number(r.entityId), entityName: r.entityName, layerCode: r.layerCode,
      schemaName: r.schemaName, sourceName: r.sourceName, ownerName: r.ownerName,
      qualityStatus: r.qualityStatus, dqTagCount: Number(r.dqTagCount), columnCount: Number(r.columnCount),
      isCurrent: Number(r.entityId) === currentEntityId, hasUpstreamIssue: false, columns: [],
    },
  ]));
}

export async function getLineageGraph(
  assetType: LineageAssetType,
  assetId: number,
  scope: LineageScopeCode,
  upDepth: number,
  downDepth: number,
): Promise<LineageGraph> {
  // Resolve the focus asset into the traversal scope's own id space.
  let focusAssetId = assetId;
  let focusColumnName: string | null = null;
  if (scope === "ENTITY_LEVEL" && assetType === "DATA_ATTRIBUTES") {
    const [row] = await sql<{ entityId: number }[]>`SELECT entity_id AS "entityId" FROM bayanat.data_attributes WHERE attribute_id = ${assetId}`;
    focusAssetId = row?.entityId ?? assetId;
  }
  if (scope === "ATTRIBUTE_LEVEL" && assetType === "DATA_ATTRIBUTES") {
    const [row] = await sql<{ name: string }[]>`SELECT physical_name_text AS name FROM bayanat.data_attributes WHERE attribute_id = ${assetId}`;
    focusColumnName = row?.name ?? null;
  }

  const [downRaw, upRaw, downFull, upFull] = await Promise.all([
    sql<RawImpactRow[]>`SELECT impact_level AS "depth", downstream_asset_id AS "assetId", lineage_id AS "lineageId", transformation_logic AS "transformationLogicText" FROM bayanat.fn_get_downstream_impact(${focusAssetId}, ${scope}, ${downDepth})`,
    sql<RawImpactRow[]>`SELECT impact_level AS "depth", upstream_asset_id AS "assetId", lineage_id AS "lineageId", transformation_logic AS "transformationLogicText" FROM bayanat.fn_get_upstream_impact(${focusAssetId}, ${scope}, ${upDepth})`,
    sql<{ assetId: number }[]>`SELECT DISTINCT downstream_asset_id AS "assetId" FROM bayanat.fn_get_downstream_impact(${focusAssetId}, ${scope}, 10)`,
    sql<{ assetId: number }[]>`SELECT DISTINCT upstream_asset_id AS "assetId" FROM bayanat.fn_get_upstream_impact(${focusAssetId}, ${scope}, 10)`,
  ]);

  const lineageIds = [...new Set([...downRaw, ...upRaw].map((r) => r.lineageId))];
  const edgeRows = lineageIds.length === 0 ? [] : await sql<{
    lineageId: number; sourceAssetId: number; targetAssetId: number;
    transformationTypeCode: string | null; transformationTypeName: string | null;
    processName: string | null; provenanceCode: string; isConfirmed: boolean; confidenceCode: string | null;
  }[]>`
    SELECT
      dl.lineage_id AS "lineageId", dl.source_asset_id AS "sourceAssetId", dl.target_asset_id AS "targetAssetId",
      dl.transformation_type_code AS "transformationTypeCode", tt.transformation_type_name_text AS "transformationTypeName",
      lp.process_name AS "processName", dl.provenance_code AS "provenanceCode", dl.is_confirmed AS "isConfirmed",
      dl.confidence_code AS "confidenceCode"
    FROM bayanat.data_lineage dl
    LEFT JOIN bayanat.lineage_transformation_types tt ON tt.transformation_type_code = dl.transformation_type_code
    LEFT JOIN bayanat.lineage_processes lp ON lp.process_id = dl.process_id
    WHERE dl.lineage_id = ANY(${lineageIds})
  `;
  const rawByLineageId = new Map([...downRaw, ...upRaw].map((r) => [r.lineageId, r]));

  const counts = { upstreamTotal: new Set(upFull.map((r) => r.assetId)).size, downstreamTotal: new Set(downFull.map((r) => r.assetId)).size };

  if (scope === "ENTITY_LEVEL") {
    const entityIds = [...new Set([focusAssetId, ...downRaw.map((r) => r.assetId), ...upRaw.map((r) => r.assetId)])];
    const nodeMap = await resolveEntityNodes(entityIds, focusAssetId);
    markUpstreamIssues(nodeMap, edgeRows, focusAssetId);
    const [focusEntity] = await sql<{ name: string }[]>`SELECT entity_name_text AS name FROM bayanat.data_entities WHERE entity_id = ${focusAssetId}`;
    return {
      focus: { assetType: "DATA_ENTITIES", assetId: focusAssetId, entityId: focusAssetId, name: focusEntity?.name ?? "Unknown", columnName: null },
      nodes: [...nodeMap.values()],
      edges: edgeRows.map((e) => ({
        lineageId: e.lineageId, sourceEntityId: e.sourceAssetId, targetEntityId: e.targetAssetId,
        sourceColumnName: null, targetColumnName: null,
        transformationTypeCode: e.transformationTypeCode, transformationTypeName: e.transformationTypeName,
        transformationLogicText: rawByLineageId.get(e.lineageId)?.transformationLogicText ?? null,
        processName: e.processName, provenanceCode: e.provenanceCode, isConfirmed: e.isConfirmed, confidenceCode: e.confidenceCode,
      })),
      counts,
    };
  }

  // ATTRIBUTE_LEVEL: nodes are still entities (tables), each carrying the specific
  // columns touched by this traversal — matching the Figma's table-card-with-
  // column-subtitle layout rather than one node per column.
  const attrIds = [...new Set([focusAssetId, ...downRaw.map((r) => r.assetId), ...upRaw.map((r) => r.assetId)])];
  const attrRows = attrIds.length === 0 ? [] : await sql<{ attributeId: number; name: string; entityId: number }[]>`
    SELECT attribute_id AS "attributeId", physical_name_text AS name, entity_id AS "entityId"
    FROM bayanat.data_attributes WHERE attribute_id = ANY(${attrIds})
  `;
  const attrById = new Map(attrRows.map((a) => [Number(a.attributeId), a]));
  const entityIds = [...new Set(attrRows.map((a) => Number(a.entityId)))];
  const focusEntityId = attrById.get(focusAssetId)?.entityId ?? focusAssetId;
  const nodeMap = await resolveEntityNodes(entityIds, focusEntityId);

  for (const a of attrRows) {
    const node = nodeMap.get(Number(a.entityId));
    if (node && !node.columns.some((c) => c.attributeId === Number(a.attributeId))) {
      node.columns.push({ attributeId: Number(a.attributeId), name: a.name });
    }
  }

  const edges: LineageGraphEdge[] = edgeRows.map((e) => {
    const srcAttr = attrById.get(e.sourceAssetId);
    const tgtAttr = attrById.get(e.targetAssetId);
    return {
      lineageId: e.lineageId,
      sourceEntityId: srcAttr?.entityId ?? e.sourceAssetId,
      targetEntityId: tgtAttr?.entityId ?? e.targetAssetId,
      sourceColumnName: srcAttr?.name ?? null,
      targetColumnName: tgtAttr?.name ?? null,
      transformationTypeCode: e.transformationTypeCode, transformationTypeName: e.transformationTypeName,
      transformationLogicText: rawByLineageId.get(e.lineageId)?.transformationLogicText ?? null,
      processName: e.processName, provenanceCode: e.provenanceCode, isConfirmed: e.isConfirmed, confidenceCode: e.confidenceCode,
    };
  }).filter((e) => e.sourceEntityId !== e.targetEntityId); // same-table column edges aren't drawable as inter-node edges

  const entityEdgeRows = edges.map((e) => ({ sourceAssetId: e.sourceEntityId, targetAssetId: e.targetEntityId }));
  markUpstreamIssues(nodeMap, entityEdgeRows as { sourceAssetId: number; targetAssetId: number }[], focusEntityId);

  return {
    focus: { assetType: "DATA_ATTRIBUTES", assetId: focusAssetId, entityId: focusEntityId, name: attrById.get(focusAssetId)?.name ?? "Unknown", columnName: focusColumnName },
    nodes: [...nodeMap.values()],
    edges,
    counts,
  };
}

// FR-4.4: mark any node downstream of a CRITICAL/WARNING node (within this
// loaded graph) with the "upstream issue" propagation flag.
function markUpstreamIssues(
  nodeMap: Map<number, LineageGraphNode>,
  edgeRows: { sourceAssetId: number; targetAssetId: number }[],
  _focusEntityId: number,
): void {
  const flagged = new Set([...nodeMap.values()].filter((n) => n.qualityStatus === "CRITICAL" || n.qualityStatus === "WARNING").map((n) => n.entityId));
  if (flagged.size === 0) return;
  const adjacency = new Map<number, number[]>();
  for (const e of edgeRows) {
    const arr = adjacency.get(e.sourceAssetId) ?? [];
    arr.push(e.targetAssetId);
    adjacency.set(e.sourceAssetId, arr);
  }
  const visited = new Set<number>();
  const queue = [...flagged];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      if (!flagged.has(next)) {
        const node = nodeMap.get(next);
        if (node) node.hasUpstreamIssue = true;
      }
      queue.push(next);
    }
  }
}

// ── Search (typeahead for the graph) ────────────────────────────────────────

export type LineageSearchResult = { assetType: LineageAssetType; assetId: number; name: string; entityName: string | null; schemaName: string | null };

export async function searchLineageAssets(q: string): Promise<LineageSearchResult[]> {
  const like = `%${q}%`;
  const [entities, attrs] = await Promise.all([
    sql<{ assetId: number; name: string; schemaName: string | null }[]>`
      SELECT e.entity_id AS "assetId", e.entity_name_text AS name, s.schema_name_text AS "schemaName"
      FROM bayanat.data_entities e
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE e.entity_name_text ILIKE ${like}
      ORDER BY e.entity_name_text LIMIT 10
    `,
    sql<{ assetId: number; name: string; entityName: string; schemaName: string | null }[]>`
      SELECT a.attribute_id AS "assetId", a.physical_name_text AS name, e.entity_name_text AS "entityName", s.schema_name_text AS "schemaName"
      FROM bayanat.data_attributes a
      JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      LEFT JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      WHERE a.physical_name_text ILIKE ${like}
      ORDER BY a.physical_name_text LIMIT 10
    `,
  ]);
  return [
    ...entities.map((e) => ({ assetType: "DATA_ENTITIES" as const, assetId: Number(e.assetId), name: e.name, entityName: null, schemaName: e.schemaName })),
    ...attrs.map((a) => ({ assetType: "DATA_ATTRIBUTES" as const, assetId: Number(a.assetId), name: a.name, entityName: a.entityName, schemaName: a.schemaName })),
  ];
}
