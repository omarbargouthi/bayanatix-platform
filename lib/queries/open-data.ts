import { sql } from "@/lib/db";
import type { OpenDataset, OpenDataColumn, OpenDataDqIssue } from "@/lib/types";

// postgres.js returns JSONB as a parsed JS value in most cases, but can
// occasionally return it as a JSON string when coming through complex queries.
function jsonArr<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (typeof val === "string") {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listOpenDatasets(opts: {
  userId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: OpenDataset[]; total: number }> {
  const { userId, search = "", page = 1, limit = 20 } = opts;
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const like   = "%" + search + "%";
  const offset = (page - 1) * limit;

  type Row = OpenDataset & { total: number };

  const rows = await sql<Row[]>`
    SELECT
      d.dataset_id                              AS "datasetId",
      d.dataset_name_text                       AS "datasetName",
      d.description_text                        AS "descriptionText",
      d.department_text                         AS "departmentText",
      d.category_id                             AS "categoryId",
      COALESCE(dc.name, d.category_text)        AS "categoryText",
      dc.name_ar                                AS "categoryLabelAr",
      d.purpose_text                            AS "purposeText",
      d.beneficiary_segments                    AS "beneficiarySegments",
      to_char(d.publish_date, 'YYYY-MM-DD')     AS "publishDate",
      d.coverage_from_year                      AS "coverageFromYear",
      d.coverage_to_year                        AS "coverageToYear",
      d.data_formats                            AS "dataFormats",
      d.data_size_text                          AS "dataSizeText",
      d.refresh_frequency                       AS "refreshFrequency",
      d.dq_notes_text                           AS "dqNotesText",
      d.extraction_logic                        AS "extractionLogic",
      d.status_code                             AS "statusCode",
      d.raised_by_user_id                       AS "raisedByUserId",
      u.full_name                               AS "raisedByName",
      COUNT(DISTINCT odc.od_column_id)::int     AS "columnCount",
      BOOL_OR(COALESCE(bg.is_pii_indicator, false)) AS "hasPii",
      to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
      to_char(d.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt",
      COUNT(*) OVER()::int                      AS total
    FROM bayanat.open_datasets d
    LEFT JOIN bayanat.users              u  ON u.user_id = d.raised_by_user_id
    LEFT JOIN bayanat.data_categories    dc ON dc.category_id = d.category_id
    LEFT JOIN bayanat.open_dataset_columns odc ON odc.dataset_id = d.dataset_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries  bg  ON bg.glossary_id = abt.glossary_id
    WHERE
      d.deleted_at IS NULL
      AND ${status != null ? sql`d.status_code = ${status}` : sql`true`}
      AND ${userId != null ? sql`d.raised_by_user_id = ${userId}` : sql`true`}
      AND ${search !== "" ? sql`d.dataset_name_text ILIKE ${like} OR d.description_text ILIKE ${like}` : sql`true`}
    GROUP BY d.dataset_id, u.full_name, dc.name, dc.name_ar
    ORDER BY d.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = Number(rows[0]?.total ?? 0);
  return {
    data: rows.map(({ total: _t, ...r }) => ({
      ...r,
      datasetId:           Number(r.datasetId),
      categoryId:          r.categoryId != null ? Number(r.categoryId) : null,
      columnCount:         Number(r.columnCount ?? 0),
      beneficiarySegments: jsonArr<string>(r.beneficiarySegments),
      dataFormats:         jsonArr(r.dataFormats),
      categoryLabelAr:     r.categoryLabelAr ?? null,
    })) as OpenDataset[],
    total,
  };
}

// ── Single ────────────────────────────────────────────────────────────────────

export async function getOpenDataset(datasetId: number): Promise<OpenDataset | null> {
  const rows = await sql<(Omit<OpenDataset, "columnCount" | "hasPii"> & {
    columnCount: number; hasPii: boolean;
  })[]>`
    SELECT
      d.dataset_id                              AS "datasetId",
      d.dataset_name_text                       AS "datasetName",
      d.description_text                        AS "descriptionText",
      d.department_text                         AS "departmentText",
      d.category_id                             AS "categoryId",
      COALESCE(dc.name, d.category_text)        AS "categoryText",
      dc.name_ar                                AS "categoryLabelAr",
      d.purpose_text                            AS "purposeText",
      d.beneficiary_segments                    AS "beneficiarySegments",
      to_char(d.publish_date, 'YYYY-MM-DD')     AS "publishDate",
      d.coverage_from_year                      AS "coverageFromYear",
      d.coverage_to_year                        AS "coverageToYear",
      d.data_formats                            AS "dataFormats",
      d.data_size_text                          AS "dataSizeText",
      d.refresh_frequency                       AS "refreshFrequency",
      d.dq_notes_text                           AS "dqNotesText",
      d.extraction_logic                        AS "extractionLogic",
      d.status_code                             AS "statusCode",
      d.raised_by_user_id                       AS "raisedByUserId",
      u.full_name                               AS "raisedByName",
      COUNT(DISTINCT odc.od_column_id)::int     AS "columnCount",
      BOOL_OR(COALESCE(bg.is_pii_indicator, false)) AS "hasPii",
      to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
      to_char(d.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"
    FROM bayanat.open_datasets d
    LEFT JOIN bayanat.users                u   ON u.user_id = d.raised_by_user_id
    LEFT JOIN bayanat.data_categories      dc  ON dc.category_id = d.category_id
    LEFT JOIN bayanat.open_dataset_columns odc ON odc.dataset_id = d.dataset_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries  bg  ON bg.glossary_id = abt.glossary_id
    WHERE d.dataset_id = ${datasetId} AND d.deleted_at IS NULL
    GROUP BY d.dataset_id, u.full_name, dc.name, dc.name_ar
  `;

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    datasetId:           Number(r.datasetId),
    categoryId:          r.categoryId != null ? Number(r.categoryId) : null,
    columnCount:         Number(r.columnCount ?? 0),
    beneficiarySegments: jsonArr<string>(r.beneficiarySegments),
    dataFormats:         jsonArr(r.dataFormats),
    categoryLabelAr:     r.categoryLabelAr ?? null,
  } as OpenDataset;
}

// ── Columns for a dataset ─────────────────────────────────────────────────────

export async function getDatasetColumns(datasetId: number): Promise<OpenDataColumn[]> {
  const rows = await sql<OpenDataColumn[]>`
    SELECT
      odc.od_column_id                          AS "odColumnId",
      odc.dataset_id                            AS "datasetId",
      odc.attribute_id                          AS "attributeId",
      a.physical_name_text                      AS "physicalName",
      a.friendly_name_text                      AS "friendlyName",
      a.data_type_text                          AS "dataType",
      odc.publish_name                          AS "publishName",
      odc.publish_desc                          AS "publishDesc",
      odc.sort_order                            AS "sortOrder",
      e.entity_name_text                        AS "entityName",
      e.entity_id                               AS "entityId",
      s.schema_name_text                        AS "schemaName",
      s.schema_id                               AS "schemaId",
      COALESCE(ds.source_name_text, '')         AS "sourceName",
      bg.term_name_text                         AS "classTermName",
      bg.classification_code                    AS "classTermCode",
      COALESCE(bg.is_pii_indicator, false)      AS "classTermIsPii",
      bg.pi_category_code                       AS "classTermPiCategory",
      das.overall_score                         AS "dqScore",
      COALESCE(das.rule_count, 0)::int          AS "dqRuleCount",
      odc.reclassification_reason               AS "reclassificationReason",
      odc.reclassification_request_id           AS "reclassificationRequestId",
      odc.deidentification_method               AS "deidentificationMethod",
      odc.deidentification_notes                AS "deidentificationNotes"
    FROM bayanat.open_dataset_columns odc
    JOIN bayanat.data_attributes       a    ON a.attribute_id   = odc.attribute_id
    JOIN bayanat.data_entities         e    ON e.entity_id      = a.entity_id
    JOIN bayanat.data_schemas          s    ON s.schema_id      = e.schema_id
    LEFT JOIN bayanat.data_sources     ds   ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = odc.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries  bg   ON bg.glossary_id   = abt.glossary_id
    LEFT JOIN bayanat.dq_attribute_scores  das  ON das.attribute_id = odc.attribute_id
    WHERE odc.dataset_id = ${datasetId}
    ORDER BY odc.sort_order, odc.od_column_id
  `;

  return rows.map((r) => ({
    ...r,
    odColumnId:   Number(r.odColumnId),
    datasetId:    Number(r.datasetId),
    attributeId:  Number(r.attributeId),
    entityId:     Number(r.entityId),
    schemaId:     Number(r.schemaId),
    sortOrder:    Number(r.sortOrder),
    dqRuleCount:               Number(r.dqRuleCount),
    dqScore:                   r.dqScore != null ? Number(r.dqScore) : null,
    reclassificationReason:    r.reclassificationReason ?? null,
    reclassificationRequestId: r.reclassificationRequestId != null ? Number(r.reclassificationRequestId) : null,
    classTermPiCategory:       r.classTermPiCategory ?? null,
    deidentificationMethod:    r.deidentificationMethod ?? null,
    deidentificationNotes:     r.deidentificationNotes ?? null,
  }));
}

// ── DQ Issues ─────────────────────────────────────────────────────────────────

export async function getDatasetDqIssues(datasetId: number): Promise<OpenDataDqIssue[]> {
  const rows = await sql<OpenDataDqIssue[]>`
    SELECT
      i.issue_id                                AS "issueId",
      i.dataset_id                              AS "datasetId",
      i.attribute_id                            AS "attributeId",
      a.physical_name_text                      AS "columnName",
      i.dimension_code                          AS "dimensionCode",
      dim.dimension_name_text                   AS "dimensionName",
      i.issue_text                              AS "issueText",
      i.severity_code                           AS "severityCode",
      to_char(i.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
    FROM bayanat.open_dataset_dq_issues i
    LEFT JOIN bayanat.data_attributes a   ON a.attribute_id   = i.attribute_id
    LEFT JOIN bayanat.dq_dimensions   dim ON dim.dimension_code = i.dimension_code
    WHERE i.dataset_id = ${datasetId}
    ORDER BY i.issue_id
  `;

  return rows.map((r) => ({
    ...r,
    issueId:     Number(r.issueId),
    datasetId:   Number(r.datasetId),
    attributeId: r.attributeId != null ? Number(r.attributeId) : null,
  }));
}

// ── Workflow progress (for the approval stage cards) ───────────────────────────

export type OpenDataWorkflowProgress = {
  currentStageName:    string | null;
  completedStageNames: string[];
  workflowStatus:      string | null;
};

export async function getOpenDatasetWorkflowProgress(datasetId: number): Promise<OpenDataWorkflowProgress | null> {
  const [req] = await sql<{ requestId: number }[]>`
    SELECT art.request_id AS "requestId"
    FROM bayanat.asset_request_targets art
    JOIN bayanat.asset_requests ar ON ar.request_id = art.request_id
    WHERE art.asset_type_code = 'OPEN_DATASET' AND art.asset_id = ${datasetId}
      AND ar.request_type_code IN ('PUBLISH_OPEN_DATA', 'PUBLISH_OPEN_DATA_PI')
    ORDER BY art.request_id DESC LIMIT 1
  `;
  if (!req) return null;

  const [inst] = await sql<{ instanceId: number; status: string; currentStageName: string | null }[]>`
    SELECT wi.instance_id AS "instanceId", wi.status_code AS "status", ws.stage_name_text AS "currentStageName"
    FROM bayanat.workflow_instances wi
    LEFT JOIN bayanat.workflow_stages ws ON ws.stage_id = wi.current_stage_id
    WHERE wi.request_id = ${req.requestId}
    ORDER BY wi.instance_id DESC LIMIT 1
  `;
  if (!inst) return null;

  const completed = await sql<{ stageName: string }[]>`
    SELECT DISTINCT ws.stage_name_text AS "stageName"
    FROM bayanat.workflow_stage_history h
    JOIN bayanat.workflow_stages ws ON ws.stage_id = h.stage_id
    WHERE h.instance_id = ${inst.instanceId} AND h.completed_at IS NOT NULL
  `;

  return {
    currentStageName:    inst.currentStageName,
    completedStageNames: completed.map((c) => c.stageName),
    workflowStatus:      inst.status,
  };
}
