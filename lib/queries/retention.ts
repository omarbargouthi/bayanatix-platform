import { sql } from "../db";
import type { RetentionOverview } from "../types";
import { getCategoryRelationships } from "./retention-relationships";

export type CategoryEntity = {
  entityId: number;
  entityName: string;
  schemaName: string;
  sourceName: string;
  keyAttributeId: number | null;
  keyAttributeName: string | null;
  cascadeEnabled: boolean;
  isMaster: boolean;
  dateAttributeId: number | null;
  dateAttributeName: string | null;
};

export async function getCategoryEntities(categoryId: number): Promise<CategoryEntity[]> {
  return sql<CategoryEntity[]>`
    SELECT
      e.entity_id AS "entityId", e.entity_name_text AS "entityName",
      s.schema_name_text AS "schemaName", ds.source_name_text AS "sourceName",
      e.retention_key_attribute_id AS "keyAttributeId", ka.physical_name_text AS "keyAttributeName",
      e.retention_cascade_enabled AS "cascadeEnabled",
      e.retention_is_master AS "isMaster",
      e.retention_date_attribute_id AS "dateAttributeId", da.physical_name_text AS "dateAttributeName"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.data_attributes ka ON ka.attribute_id = e.retention_key_attribute_id
    LEFT JOIN bayanat.data_attributes da ON da.attribute_id = e.retention_date_attribute_id
    WHERE e.retention_category_id = ${categoryId}
    ORDER BY e.retention_is_master DESC, e.entity_name_text
  `;
}

export async function assignCategoryEntity(
  categoryId: number, entityId: number, keyAttributeId: number | null, cascadeEnabled: boolean,
): Promise<void> {
  await sql`
    UPDATE bayanat.data_entities SET
      retention_category_id      = ${categoryId},
      retention_key_attribute_id = ${keyAttributeId},
      retention_cascade_enabled  = ${cascadeEnabled}
    WHERE entity_id = ${entityId}
  `;
}

export async function updateCategoryEntity(
  entityId: number, keyAttributeId: number | null, cascadeEnabled: boolean, isMaster: boolean,
  dateAttributeId: number | null,
): Promise<void> {
  await sql`
    UPDATE bayanat.data_entities SET
      retention_key_attribute_id  = ${keyAttributeId},
      retention_cascade_enabled   = ${cascadeEnabled},
      retention_is_master         = ${isMaster},
      retention_date_attribute_id = ${dateAttributeId}
    WHERE entity_id = ${entityId}
  `;
}

export async function unassignCategoryEntity(categoryId: number, entityId: number): Promise<void> {
  await sql`
    UPDATE bayanat.data_entities SET
      retention_category_id       = NULL,
      retention_key_attribute_id  = NULL,
      retention_cascade_enabled   = FALSE,
      retention_is_master         = FALSE,
      retention_date_attribute_id = NULL
    WHERE entity_id = ${entityId} AND retention_category_id = ${categoryId}
  `;
}

export async function getRetentionOverview(): Promise<RetentionOverview> {
  const [
    countRows,
    holdRows,
    entityRows,
    statusRows,
    sensitivityRows,
  ] = await Promise.all([
    sql<{ totalCategories: number; totalSchedules: number }[]>`
      SELECT
        (SELECT COUNT(*) FROM bayanat.data_categories WHERE is_active = true)::int AS "totalCategories",
        (SELECT COUNT(*) FROM bayanat.retention_schedules)::int                    AS "totalSchedules"
    `,

    sql<{ active: number }[]>`
      SELECT COUNT(*)::int AS active
      FROM bayanat.legal_holds
      WHERE hold_status = 'ACTIVE'
    `,

    sql<{ classified: number; total: number; expiringSoon: number; overdue: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE retention_category_id IS NOT NULL)::int      AS classified,
        COUNT(*)::int                                                         AS total,
        COUNT(*) FILTER (
          WHERE effective_expiry_date IS NOT NULL
            AND effective_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
        )::int AS "expiringSoon",
        COUNT(*) FILTER (
          WHERE effective_expiry_date IS NOT NULL
            AND effective_expiry_date < CURRENT_DATE
            AND (retention_status IS NULL OR retention_status NOT IN ('PURGED','ARCHIVED'))
        )::int AS overdue
      FROM bayanat.data_entities
    `,

    sql<{ status: string; count: number }[]>`
      SELECT retention_status AS status, COUNT(*)::int AS count
      FROM bayanat.data_entities
      WHERE retention_status IS NOT NULL
      GROUP BY retention_status
      ORDER BY count DESC
    `,

    sql<{ sensitivity: string; count: number }[]>`
      SELECT dc.sensitivity, COUNT(de.entity_id)::int AS count
      FROM bayanat.data_categories dc
      JOIN bayanat.data_entities de ON de.retention_category_id = dc.category_id
      GROUP BY dc.sensitivity
      ORDER BY count DESC
    `,
  ]);

  return {
    totalCategories:    countRows[0].totalCategories,
    totalSchedules:     countRows[0].totalSchedules,
    activeHolds:        holdRows[0].active,
    entitiesClassified: entityRows[0].classified,
    entitiesTotal:      entityRows[0].total,
    expiringSoon:       entityRows[0].expiringSoon,
    overdue:            entityRows[0].overdue,
    byStatus:           statusRows,
    bySensitivity:      sensitivityRows,
  };
}

// % of active retention categories that have at least one retention schedule defined.
export async function getCategoriesWithSchedulePct(): Promise<number> {
  const [row] = await sql<{ withSchedule: number; total: number }[]>`
    SELECT
      COUNT(DISTINCT rs.category_id) FILTER (WHERE dc.is_active)::int AS "withSchedule",
      COUNT(DISTINCT dc.category_id) FILTER (WHERE dc.is_active)::int AS total
    FROM bayanat.data_categories dc
    LEFT JOIN bayanat.retention_schedules rs ON rs.category_id = dc.category_id
  `;
  return row.total > 0 ? Math.round((row.withSchedule / row.total) * 100) : 0;
}

// Overdue assets grouped by what their category's default schedule says should
// happen to them — the closest honest proxy for a "purge queue" (no dedicated
// purge-queue table exists in this schema).
export async function getPurgeQueueByAction(): Promise<{ action: string; count: number }[]> {
  return sql<{ action: string; count: number }[]>`
    SELECT COALESCE(rs.post_retention_action, 'UNSCHEDULED') AS action, COUNT(*)::int AS count
    FROM bayanat.data_entities e
    LEFT JOIN bayanat.retention_schedules rs
      ON rs.category_id = e.retention_category_id AND rs.is_default = true
    WHERE e.effective_expiry_date IS NOT NULL
      AND e.effective_expiry_date < CURRENT_DATE
      AND (e.retention_status IS NULL OR e.retention_status NOT IN ('PURGED','ARCHIVED'))
    GROUP BY COALESCE(rs.post_retention_action, 'UNSCHEDULED')
    ORDER BY count DESC
  `;
}

// ── Purge configuration manifest ────────────────────────────────────────────
// Read-only bundle for an EXTERNAL retention/purge application to consume —
// Bayanatix hosts this configuration but never executes any DELETE/UPDATE
// against a source system itself. No credentials are included (host/db/
// schema names only) — the external process is expected to hold its own
// connection secrets.

export type ManifestTable = {
  entityId: number; entityName: string; schemaName: string; sourceName: string;
  dbTypeCode: string | null; hostAddress: string | null; databaseName: string | null; portNumber: number | null;
  keyAttributeId: number | null; keyAttributeName: string | null;
  isMaster: boolean; cascadeEnabled: boolean;
  dateAttributeId: number | null; dateAttributeName: string | null;
};

export type ManifestHoldCondition = {
  entityId: number; attributeId: number; attributeName: string;
  operator: string; valueText: string; valueText2: string | null; logicOperator: "AND" | "OR";
  holdId: number; caseReference: string;
};

export type CategoryManifest = {
  categoryId: number; categoryName: string; sensitivity: string;
  schedules: {
    scheduleId: number; jurisdiction: string; triggerEvent: string;
    retentionPeriod: number; retentionUnit: string; postRetentionAction: string;
    automationConfigJson: { technique?: string; details?: string } | null;
  }[];
  tables: ManifestTable[];
  relationships: Awaited<ReturnType<typeof getCategoryRelationships>>;
  activeHoldConditions: ManifestHoldCondition[];
};

export async function getCategoryManifest(categoryId: number): Promise<CategoryManifest | null> {
  const [category] = await sql<{ categoryName: string; sensitivity: string }[]>`
    SELECT name AS "categoryName", sensitivity FROM bayanat.data_categories WHERE category_id = ${categoryId}
  `;
  if (!category) return null;

  const [schedules, tables, relationships] = await Promise.all([
    sql<CategoryManifest["schedules"]>`
      SELECT schedule_id AS "scheduleId", jurisdiction, trigger_event AS "triggerEvent",
        retention_period AS "retentionPeriod", retention_unit AS "retentionUnit",
        post_retention_action AS "postRetentionAction", automation_config_json AS "automationConfigJson"
      FROM bayanat.retention_schedules WHERE category_id = ${categoryId}
      ORDER BY is_default DESC, jurisdiction
    `,
    sql<ManifestTable[]>`
      SELECT
        e.entity_id AS "entityId", e.entity_name_text AS "entityName",
        s.schema_name_text AS "schemaName", ds.source_name_text AS "sourceName",
        cr.db_type_code AS "dbTypeCode", cr.host_address AS "hostAddress",
        cr.database_name AS "databaseName", cr.port_number AS "portNumber",
        e.retention_key_attribute_id AS "keyAttributeId", ka.physical_name_text AS "keyAttributeName",
        e.retention_is_master AS "isMaster", e.retention_cascade_enabled AS "cascadeEnabled",
        e.retention_date_attribute_id AS "dateAttributeId", da.physical_name_text AS "dateAttributeName"
      FROM bayanat.data_entities e
      JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
      JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
      LEFT JOIN bayanat.connection_registry cr ON cr.connection_id = ds.connection_id
      LEFT JOIN bayanat.data_attributes ka ON ka.attribute_id = e.retention_key_attribute_id
      LEFT JOIN bayanat.data_attributes da ON da.attribute_id = e.retention_date_attribute_id
      WHERE e.retention_category_id = ${categoryId}
      ORDER BY e.retention_is_master DESC, e.entity_name_text
    `,
    getCategoryRelationships(categoryId),
  ]);

  const tableEntityIds = [
    ...new Set([...tables.map((t) => t.entityId), ...relationships.flatMap((r) => [r.parentEntityId, r.childEntityId])]),
  ];

  const activeHoldConditions = tableEntityIds.length === 0 ? [] : await sql<ManifestHoldCondition[]>`
    SELECT
      lhe.entity_id AS "entityId", lhc.attribute_id AS "attributeId", a.physical_name_text AS "attributeName",
      lhc.operator AS operator, lhc.value_text AS "valueText", lhc.value_text_2 AS "valueText2",
      lhc.logic_operator AS "logicOperator", lh.hold_id AS "holdId", lh.case_reference AS "caseReference"
    FROM bayanat.legal_hold_conditions lhc
    JOIN bayanat.legal_hold_entities lhe ON lhe.hold_id = lhc.hold_id AND lhe.entity_id = lhc.entity_id
    JOIN bayanat.legal_holds lh ON lh.hold_id = lhc.hold_id
    JOIN bayanat.data_attributes a ON a.attribute_id = lhc.attribute_id
    WHERE lh.hold_status = 'ACTIVE' AND lhe.entity_id = ANY(${tableEntityIds})
    ORDER BY lhe.entity_id, lhc.created_at
  `;

  return {
    categoryId, categoryName: category.categoryName, sensitivity: category.sensitivity,
    schedules, tables, relationships, activeHoldConditions,
  };
}
