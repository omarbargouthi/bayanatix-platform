// Data subject requests (db/149) — answered by following the retention
// configuration: the category's master table (where the subject's identifier
// lives), its registered relationships to child tables, the PI columns of every
// table on that path, the category's retention schedule and its active legal holds.
// The result is a manifest the team (or external process) executing the request
// works from; Bayanis never stores the subject's identity or touches the data.
import { sql } from "../db";
import { logUpdate } from "../audit";
import { createNotification } from "../queries/notifications";
import { resolveAssetSteward } from "../workflow";

export type DsrType = "ACCESS" | "CORRECTION" | "ERASURE" | "RESTRICTION";
export const DSR_TYPES: DsrType[] = ["ACCESS", "CORRECTION", "ERASURE", "RESTRICTION"];
export const DSR_DEFAULT_DAYS = 30;

export type DsrPiColumn = { attributeId: number; name: string; dataType: string | null; classification: string | null; piCategory: string | null };
export type DsrPathStep = { fromTable: string; fromColumn: string; toTable: string; toColumn: string; extraCondition: string | null };
export type DsrHoldRule = { holdId: number; caseReference: string; attributeName: string; operator: string; valueText: string; valueText2: string | null; logicOperator: string };
export type DsrTable = {
  entityId: number; name: string; schema: string; source: string;
  dbType: string | null; host: string | null; database: string | null;
  isRoot: boolean; hop: number; path: DsrPathStep[];
  keyColumn: string | null; dateColumn: string | null;
  piColumns: DsrPiColumn[];
  action: string; actionReason: string;
  retentionRule: string | null;          // rows still inside the retention period are kept
  holdRules: DsrHoldRule[];              // rows matching an active legal hold are kept
  executionOrder: number;                // erasure: children before parents
  owners: string[];
  locateSql: string;
  item: { itemId: number; status: string; note: string | null; updatedBy: string | null; updatedAt: string | null } | null;
};
export type DsrDownstreamCopy = { fromTable: string; fromColumn: string; source: string; schema: string; table: string; column: string; isPii: boolean; hops: number };
export type DsrManifest = {
  request: DsrRequest;
  category: { categoryId: number; name: string; sensitivity: string | null };
  identifier: { entityId: number; table: string; column: string; schema: string; source: string };
  schedule: { scheduleId: number; jurisdiction: string; action: string; period: number; unit: string; triggerEvent: string; technique: string | null; details: string | null; reference: string | null } | null;
  categoryHolds: { holdId: number; caseReference: string; caseName: string }[];
  tables: DsrTable[];
  unreachable: { entityId: number; name: string }[];
  downstreamCopies: DsrDownstreamCopy[];
  warnings: string[];
  generatedAt: string;
};
export type DsrRequest = {
  requestId: number; referenceCode: string; requestType: DsrType; categoryId: number; categoryName: string;
  identifierAttributeId: number; identifierLabel: string; externalReference: string | null; channel: string | null;
  receivedDate: string; dueDate: string; statusCode: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  extensionReason: string | null; correctionDetails: string | null; notes: string | null; responseSummary: string | null;
  createdBy: string | null; createdAt: string; completedAt: string | null;
  itemsTotal: number; itemsOpen: number; daysLeft: number;
};

const REQUEST_COLS = sql`
  r.request_id AS "requestId", r.reference_code AS "referenceCode", r.request_type AS "requestType",
  r.category_id AS "categoryId", c.name AS "categoryName", r.identifier_attribute_id AS "identifierAttributeId",
  (ie.entity_name_text || '.' || ia.physical_name_text) AS "identifierLabel",
  r.external_reference AS "externalReference", r.channel, r.received_date::text AS "receivedDate", r.due_date::text AS "dueDate",
  r.status_code AS "statusCode", r.extension_reason AS "extensionReason", r.correction_details AS "correctionDetails",
  r.notes, r.response_summary AS "responseSummary", u.full_name AS "createdBy", r.created_at::text AS "createdAt", r.completed_at::text AS "completedAt",
  (SELECT count(*)::int FROM bayanat.data_subject_request_items i WHERE i.request_id = r.request_id) AS "itemsTotal",
  (SELECT count(*)::int FROM bayanat.data_subject_request_items i WHERE i.request_id = r.request_id AND i.status_code = 'PENDING') AS "itemsOpen",
  (r.due_date - CURRENT_DATE)::int AS "daysLeft"
`;
const REQUEST_FROM = sql`
  FROM bayanat.data_subject_requests r
  JOIN bayanat.data_categories c ON c.category_id = r.category_id
  JOIN bayanat.data_attributes ia ON ia.attribute_id = r.identifier_attribute_id
  JOIN bayanat.data_entities ie ON ie.entity_id = ia.entity_id
  LEFT JOIN bayanat.users u ON u.user_id = r.created_by_user_id
`;

export async function listDsrs(): Promise<DsrRequest[]> {
  return sql<DsrRequest[]>`SELECT ${REQUEST_COLS} ${REQUEST_FROM} ORDER BY (r.status_code IN ('COMPLETED', 'REJECTED')), r.due_date, r.request_id DESC`;
}

export async function getDsr(requestId: number): Promise<DsrRequest | null> {
  const [r] = await sql<DsrRequest[]>`SELECT ${REQUEST_COLS} ${REQUEST_FROM} WHERE r.request_id = ${requestId}`;
  return r ?? null;
}

/** Categories that can be used: with a master table, its identifier candidates. */
export async function dsrCategoryOptions(): Promise<{ categoryId: number; name: string; identifiers: { attributeId: number; label: string; isKey: boolean; isPii: boolean }[] }[]> {
  const rows = await sql<{ categoryId: number; name: string; attributeId: number; label: string; isKey: boolean; isPii: boolean }[]>`
    SELECT c.category_id AS "categoryId", c.name, a.attribute_id AS "attributeId",
           e.entity_name_text || '.' || a.physical_name_text AS label,
           (a.attribute_id = e.retention_key_attribute_id) AS "isKey",
           EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
                   WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION' AND bg.is_pii_indicator) AS "isPii"
    FROM bayanat.data_categories c
    JOIN bayanat.data_entities e ON e.retention_category_id = c.category_id AND e.retention_is_master
    JOIN bayanat.data_attributes a ON a.entity_id = e.entity_id AND coalesce(a.lifecycle_status_code, 'ACTIVE') = 'ACTIVE'
    WHERE coalesce(c.is_active, true)
    ORDER BY c.name, (a.attribute_id = e.retention_key_attribute_id) DESC, a.attribute_id
  `;
  const byCat = new Map<number, { categoryId: number; name: string; identifiers: { attributeId: number; label: string; isKey: boolean; isPii: boolean }[] }>();
  for (const r of rows) {
    const c = byCat.get(r.categoryId) ?? { categoryId: r.categoryId, name: r.name, identifiers: [] };
    // the key column, then the PI columns (email, national ID…) people are usually identified by
    if (r.isKey || r.isPii) c.identifiers.push({ attributeId: Number(r.attributeId), label: r.label, isKey: r.isKey, isPii: r.isPii });
    byCat.set(r.categoryId, c);
  }
  return [...byCat.values()].filter((c) => c.identifiers.length > 0);
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

export async function buildDsrManifest(requestId: number): Promise<DsrManifest | null> {
  const request = await getDsr(requestId);
  if (!request) return null;
  const warnings: string[] = [];

  const [category] = await sql<{ name: string; sensitivity: string | null }[]>`SELECT name, sensitivity FROM bayanat.data_categories WHERE category_id = ${request.categoryId}`;
  const [ident] = await sql<{ entityId: number; table: string; column: string; schema: string; source: string }[]>`
    SELECT e.entity_id AS "entityId", e.entity_name_text AS table, a.physical_name_text AS column, s.schema_name_text AS schema, d.source_name_text AS source
    FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
    WHERE a.attribute_id = ${request.identifierAttributeId}
  `;
  const rootId = Number(ident.entityId);

  // The category's default schedule (or its first) decides what erasure means.
  const [schedule] = await sql<NonNullable<DsrManifest["schedule"]>[]>`
    SELECT schedule_id AS "scheduleId", jurisdiction, post_retention_action AS action, retention_period AS period, retention_unit AS unit,
           trigger_event AS "triggerEvent", automation_config_json->>'technique' AS technique, automation_config_json->>'details' AS details,
           regulatory_reference AS reference
    FROM bayanat.retention_schedules WHERE category_id = ${request.categoryId}
    ORDER BY is_default DESC, schedule_id LIMIT 1
  `;
  if (!schedule && request.requestType === "ERASURE") warnings.push("No retention schedule is defined for this category — erasure defaults to delete. Confirm the action with the data protection officer.");

  // Path: breadth-first from the identifier's table along active registered relationships.
  const rels = await sql<{ parent: number; parentCol: string; child: number; childCol: string; extra: string | null; parentName: string; childName: string }[]>`
    SELECT r.parent_entity_id AS parent, pa.physical_name_text AS "parentCol", r.child_entity_id AS child, ca.physical_name_text AS "childCol",
           r.join_condition_text AS extra, pe.entity_name_text AS "parentName", ce.entity_name_text AS "childName"
    FROM bayanat.retention_relationships r
    JOIN bayanat.data_attributes pa ON pa.attribute_id = r.parent_attribute_id JOIN bayanat.data_attributes ca ON ca.attribute_id = r.child_attribute_id
    JOIN bayanat.data_entities pe ON pe.entity_id = r.parent_entity_id JOIN bayanat.data_entities ce ON ce.entity_id = r.child_entity_id
    WHERE r.category_id = ${request.categoryId} AND r.is_active
  `;
  const paths = new Map<number, DsrPathStep[]>([[rootId, []]]);
  let frontier = [rootId];
  while (frontier.length) {
    const next: number[] = [];
    for (const from of frontier) {
      for (const r of rels.filter((x) => Number(x.parent) === from)) {
        const child = Number(r.child);
        if (paths.has(child)) continue;
        paths.set(child, [...paths.get(from)!, { fromTable: r.parentName, fromColumn: r.parentCol, toTable: r.childName, toColumn: r.childCol, extraCondition: r.extra }]);
        next.push(child);
      }
    }
    frontier = next;
  }
  const entityIds = [...paths.keys()];

  const ents = await sql<{ entityId: number; name: string; schema: string; source: string; dbType: string | null; host: string | null; database: string | null; keyColumn: string | null; dateColumn: string | null; categoryId: number | null }[]>`
    SELECT e.entity_id AS "entityId", e.entity_name_text AS name, s.schema_name_text AS schema, d.source_name_text AS source,
           coalesce(cr.db_type_code, d.source_type_code) AS "dbType", cr.host_address AS host, coalesce(cr.database_name, d.database_name_text) AS database,
           ka.physical_name_text AS "keyColumn", da.physical_name_text AS "dateColumn", e.retention_category_id AS "categoryId"
    FROM bayanat.data_entities e
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources d ON d.data_source_id = s.data_source_id
    LEFT JOIN bayanat.connection_registry cr ON cr.connection_id = d.connection_id
    LEFT JOIN bayanat.data_attributes ka ON ka.attribute_id = e.retention_key_attribute_id
    LEFT JOIN bayanat.data_attributes da ON da.attribute_id = e.retention_date_attribute_id
    WHERE e.entity_id = ANY(${entityIds})
  `;
  const entById = new Map(ents.map((e) => [Number(e.entityId), e]));

  // PI columns of every table on the path (classification term flagged as PI).
  const piRows = await sql<(DsrPiColumn & { entityId: number })[]>`
    SELECT a.entity_id AS "entityId", a.attribute_id AS "attributeId", a.physical_name_text AS name, a.data_type_text AS "dataType",
           bg.term_name_text AS classification, pc.category_name_text AS "piCategory"
    FROM bayanat.data_attributes a
    JOIN bayanat.asset_business_terms abt ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
    JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id AND bg.is_pii_indicator
    LEFT JOIN bayanat.pi_category_types pc ON pc.category_code = bg.pi_category_code
    WHERE a.entity_id = ANY(${entityIds}) AND coalesce(a.lifecycle_status_code, 'ACTIVE') = 'ACTIVE'
    ORDER BY a.entity_id, a.attribute_id
  `;
  const piByEntity = new Map<number, DsrPiColumn[]>();
  for (const p of piRows) {
    const list = piByEntity.get(Number(p.entityId)) ?? [];
    if (!list.some((x) => x.attributeId === Number(p.attributeId))) list.push({ attributeId: Number(p.attributeId), name: p.name, dataType: p.dataType, classification: p.classification, piCategory: p.piCategory });
    piByEntity.set(Number(p.entityId), list);
  }

  // Active legal holds: category-wide (no driving tables) and row conditions per table.
  const categoryHolds = await sql<DsrManifest["categoryHolds"]>`
    SELECT h.hold_id AS "holdId", h.case_reference AS "caseReference", h.case_name AS "caseName"
    FROM bayanat.legal_holds h JOIN bayanat.legal_hold_categories hc ON hc.hold_id = h.hold_id
    WHERE hc.category_id = ${request.categoryId} AND h.hold_status = 'ACTIVE' AND NOT h.is_deleted
      AND NOT EXISTS (SELECT 1 FROM bayanat.legal_hold_entities he WHERE he.hold_id = h.hold_id)
  `;
  const holdRows = await sql<(DsrHoldRule & { entityId: number })[]>`
    SELECT he.entity_id AS "entityId", h.hold_id AS "holdId", h.case_reference AS "caseReference", a.physical_name_text AS "attributeName",
           c.operator, c.value_text AS "valueText", c.value_text_2 AS "valueText2", c.logic_operator AS "logicOperator"
    FROM bayanat.legal_hold_entities he
    JOIN bayanat.legal_holds h ON h.hold_id = he.hold_id AND h.hold_status = 'ACTIVE' AND NOT h.is_deleted
    JOIN bayanat.legal_hold_conditions c ON c.hold_id = he.hold_id AND c.entity_id = he.entity_id
    JOIN bayanat.data_attributes a ON a.attribute_id = c.attribute_id
    WHERE he.entity_id = ANY(${entityIds})
    ORDER BY he.entity_id, c.created_at
  `;
  const heldWhole = await sql<{ entityId: number; holdId: number; caseReference: string }[]>`
    SELECT he.entity_id AS "entityId", h.hold_id AS "holdId", h.case_reference AS "caseReference"
    FROM bayanat.legal_hold_entities he JOIN bayanat.legal_holds h ON h.hold_id = he.hold_id AND h.hold_status = 'ACTIVE' AND NOT h.is_deleted
    WHERE he.entity_id = ANY(${entityIds})
      AND NOT EXISTS (SELECT 1 FROM bayanat.legal_hold_conditions c WHERE c.hold_id = he.hold_id AND c.entity_id = he.entity_id)
  `;

  const itemRows = await sql<{ entityId: number; itemId: number; status: string; note: string | null; updatedBy: string | null; updatedAt: string | null }[]>`
    SELECT i.entity_id AS "entityId", i.item_id AS "itemId", i.status_code AS status, i.note, u.full_name AS "updatedBy", i.updated_at::text AS "updatedAt"
    FROM bayanat.data_subject_request_items i LEFT JOIN bayanat.users u ON u.user_id = i.updated_by_user_id
    WHERE i.request_id = ${requestId}
  `;
  const itemByEntity = new Map(itemRows.map((i) => [Number(i.entityId), { itemId: Number(i.itemId), status: i.status, note: i.note, updatedBy: i.updatedBy, updatedAt: i.updatedAt }]));

  const rootEnt = entById.get(rootId)!;
  const tables: DsrTable[] = [];
  for (const [entityId, path] of paths) {
    const e = entById.get(entityId);
    if (!e) continue;
    const piColumns = piByEntity.get(entityId) ?? [];
    const holdRules = holdRows.filter((h) => Number(h.entityId) === entityId).map(({ entityId: _e, ...h }) => h);
    const whole = heldWhole.filter((h) => Number(h.entityId) === entityId);

    // Rows inside the retention period are kept (legal retention obligation): the
    // table's own retention date column, else the master's, through the join path.
    const dateCol = e.dateColumn ? `${e.name}.${e.dateColumn}` : rootEnt.dateColumn ? `${rootEnt.name}.${rootEnt.dateColumn}` : null;
    const retentionRule = request.requestType === "ERASURE" && schedule && dateCol
      ? `Keep rows where ${dateCol} + ${schedule.period} ${schedule.unit.toLowerCase()} is after the request date (retention obligation still running)`
      : null;

    let action: string, actionReason: string;
    switch (request.requestType) {
      case "ACCESS": action = "EXTRACT"; actionReason = piColumns.length ? `Provide the subject's values of ${piColumns.length} PI column(s)` : "No PI-classified columns — confirm whether the located rows hold personal data"; break;
      case "CORRECTION": action = "CORRECT"; actionReason = "Correct the subject's values in the PI columns named in the request"; break;
      case "RESTRICTION": action = "RESTRICT"; actionReason = "Flag the subject's rows so they are stored but not processed"; break;
      default: {
        if (categoryHolds.length || whole.length) {
          action = "RETAIN";
          actionReason = `Under legal hold ${[...categoryHolds, ...whole].map((h) => h.caseReference).join(", ")} — erasure is blocked while the hold is active`;
        } else {
          action = schedule?.action ?? "DELETE";
          const link = path.at(-1);
          actionReason = action === "ANONYMIZE"
            ? piColumns.length
              ? `Anonymise the ${piColumns.length} PI column(s) of the subject's rows${schedule?.technique ? ` (${schedule.technique})` : ""}`
              : `No PI-classified columns — the rows only refer to the subject through ${link ? `${link.toTable}.${link.toColumn}` : "the key"}; nothing to anonymise unless other personal data is present (classify it to include it)`
            : action === "DELETE" ? "Delete the subject's rows" : `${action} the subject's rows (retention schedule action)`;
          if (holdRules.length) actionReason += " — except rows matching the legal hold conditions";
          // A legal hold on a table higher up the path keeps the linked rows here too.
          const heldAbove = path.some((step) => {
            const parent = ents.find((x) => x.name === step.fromTable);
            return parent ? holdRows.some((h) => Number(h.entityId) === Number(parent.entityId)) : false;
          });
          if (heldAbove) actionReason += " — except rows linked to parent rows kept by a legal hold";
          if (retentionRule) actionReason += " — except rows still inside the retention period";
        }
      }
    }

    // Parameterised locate query: from the identifier column through the path.
    const alias = (i: number) => `t${i}`;
    const lines = [`FROM ${q(rootEnt.schema)}.${q(rootEnt.name)} ${alias(0)}`];
    path.forEach((step, i) => {
      const stepEnt = ents.find((x) => x.name === step.toTable && paths.get(Number(x.entityId))?.length === i + 1) ?? e;
      lines.push(`JOIN ${q(stepEnt.schema)}.${q(step.toTable)} ${alias(i + 1)} ON ${alias(i + 1)}.${q(step.toColumn)} = ${alias(i)}.${q(step.fromColumn)}`
        + (step.extraCondition ? `\n  /* additional condition: ${step.extraCondition.replace(/\*\//g, "* /")} */` : ""));
    });
    const last = alias(path.length);
    const cols = piColumns.length ? piColumns.map((c) => `${last}.${q(c.name)}`) : [e.keyColumn ? `${last}.${q(e.keyColumn)}` : `${last}.*`];
    const locateSql = [`SELECT ${cols.join(", ")}`, ...lines, `WHERE ${alias(0)}.${q(ident.column)} = :subject_identifier`].join("\n");

    tables.push({
      entityId, name: e.name, schema: e.schema, source: e.source, dbType: e.dbType, host: e.host, database: e.database,
      isRoot: entityId === rootId, hop: path.length, path, keyColumn: e.keyColumn, dateColumn: e.dateColumn,
      piColumns, action, actionReason, retentionRule, holdRules, executionOrder: 0,
      owners: (await resolveAssetSteward("DATA_ENTITIES", entityId).catch(() => [] as string[])),
      locateSql, item: itemByEntity.get(entityId) ?? null,
    });
  }
  // Erasure runs children first (deepest hop first) so parents aren't removed under them.
  const order = [...tables].sort((a, b) => (request.requestType === "ERASURE" ? b.hop - a.hop : a.hop - b.hop) || a.name.localeCompare(b.name));
  order.forEach((t, i) => { t.executionOrder = i + 1; });
  tables.sort((a, b) => a.hop - b.hop || a.name.localeCompare(b.name));
  const ownerIds = [...new Set(tables.flatMap((t) => t.owners))];
  const ownerNames = ownerIds.length ? new Map((await sql<{ id: string; n: string }[]>`SELECT user_id AS id, full_name AS n FROM bayanat.users WHERE user_id = ANY(${ownerIds})`).map((r) => [r.id, r.n])) : new Map();
  for (const t of tables) t.owners = t.owners.map((o) => ownerNames.get(o) ?? o);

  // Category tables the subject can't be reached in (no registered relationship).
  const unreachable = (await sql<{ entityId: number; name: string }[]>`
    SELECT entity_id AS "entityId", entity_name_text AS name FROM bayanat.data_entities
    WHERE retention_category_id = ${request.categoryId} AND NOT (entity_id = ANY(${entityIds}))
  `).map((r) => ({ entityId: Number(r.entityId), name: r.name }));
  if (unreachable.length) warnings.push(`${unreachable.length} table(s) in this category have no registered relationship from ${ident.table} — the subject's rows there can't be located. Register the relationship in Data Categories.`);
  if (piRows.length === 0) warnings.push("No PI-classified columns were found on the path — classify the personal-data columns so they are included.");

  // Copies of these PI columns outside the retention path, via column-level lineage.
  const piIds = piRows.map((p) => Number(p.attributeId));
  const downstreamCopies = piIds.length === 0 ? [] : (await sql<(DsrDownstreamCopy & { targetEntity: number })[]>`
    WITH RECURSIVE down AS (
      SELECT dl.source_asset_id AS origin, dl.target_asset_id AS attr, 1 AS hops
      FROM bayanat.data_lineage dl WHERE dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND dl.source_asset_id = ANY(${piIds})
      UNION
      SELECT d.origin, dl.target_asset_id, d.hops + 1
      FROM down d JOIN bayanat.data_lineage dl ON dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND dl.source_asset_id = d.attr
      WHERE d.hops < 6
    )
    SELECT DISTINCT ON (d.attr)
      oe.entity_name_text AS "fromTable", oa.physical_name_text AS "fromColumn",
      src.source_name_text AS source, s.schema_name_text AS schema, e.entity_name_text AS table, a.physical_name_text AS column,
      EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
              WHERE abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION' AND bg.is_pii_indicator) AS "isPii",
      d.hops, e.entity_id AS "targetEntity"
    FROM down d
    JOIN bayanat.data_attributes a ON a.attribute_id = d.attr JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id JOIN bayanat.data_sources src ON src.data_source_id = s.data_source_id
    JOIN bayanat.data_attributes oa ON oa.attribute_id = d.origin JOIN bayanat.data_entities oe ON oe.entity_id = oa.entity_id
    ORDER BY d.attr, d.hops
  `).filter((c) => !entityIds.includes(Number(c.targetEntity))).map(({ targetEntity: _t, ...c }) => c);
  if (downstreamCopies.length) warnings.push(`${downstreamCopies.length} copy(ies) of these PI columns exist downstream outside the retention path (from lineage) — review them as part of the request.`);

  return {
    request, category: { categoryId: request.categoryId, name: category?.name ?? "", sensitivity: category?.sensitivity ?? null },
    identifier: { ...ident, entityId: rootId }, schedule: schedule ?? null, categoryHolds, tables, unreachable, downstreamCopies, warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function syncItems(requestId: number): Promise<void> {
  const m = await buildDsrManifest(requestId);
  if (!m) return;
  for (const t of m.tables) {
    await sql`
      INSERT INTO bayanat.data_subject_request_items (request_id, entity_id, action_code, pi_column_count)
      VALUES (${requestId}, ${t.entityId}, ${t.action}, ${t.piColumns.length})
      ON CONFLICT (request_id, entity_id) DO UPDATE SET action_code = EXCLUDED.action_code, pi_column_count = EXCLUDED.pi_column_count
    `;
  }
}

export async function createDsr(input: {
  requestType: DsrType; categoryId: number; identifierAttributeId: number; externalReference: string | null; channel: string | null;
  receivedDate: string | null; correctionDetails: string | null; notes: string | null;
}, userId: string): Promise<{ requestId: number; referenceCode: string } | { error: string }> {
  if (!DSR_TYPES.includes(input.requestType)) return { error: "Unknown request type" };
  const options = await dsrCategoryOptions();
  const cat = options.find((c) => c.categoryId === input.categoryId);
  if (!cat) return { error: "Pick a category with a master table (Data Categories › Tables)" };
  if (!cat.identifiers.some((i) => i.attributeId === input.identifierAttributeId)) return { error: "Pick how the data subject is identified (a column of the master table)" };
  const received = input.receivedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.receivedDate) ? input.receivedDate : new Date().toISOString().slice(0, 10);

  const [row] = await sql<{ requestId: number; referenceCode: string }[]>`
    INSERT INTO bayanat.data_subject_requests
      (reference_code, request_type, category_id, identifier_attribute_id, external_reference, channel, received_date, due_date, correction_details, notes, created_by_user_id)
    VALUES (
      'DSR-' || to_char(${received}::date, 'YYYY') || '-' || lpad(((SELECT count(*) FROM bayanat.data_subject_requests WHERE to_char(received_date, 'YYYY') = to_char(${received}::date, 'YYYY')) + 1)::text, 4, '0'),
      ${input.requestType}, ${input.categoryId}, ${input.identifierAttributeId}, ${input.externalReference?.trim() || null}, ${input.channel || null},
      ${received}::date, ${received}::date + ${DSR_DEFAULT_DAYS}::int, ${input.correctionDetails?.trim() || null}, ${input.notes?.trim() || null}, ${userId}
    )
    RETURNING request_id AS "requestId", reference_code AS "referenceCode"
  `;
  await syncItems(row.requestId);
  await logUpdate("DATA_SUBJECT_REQUEST", row.requestId, userId, [{ field: "created", oldVal: null, newVal: `${row.referenceCode} (${input.requestType})` }]).catch(() => {});
  return { requestId: Number(row.requestId), referenceCode: row.referenceCode };
}

export async function refreshDsrItems(requestId: number): Promise<void> { await syncItems(requestId); }

export async function updateDsrItem(requestId: number, itemId: number, status: string, note: string | null, userId: string): Promise<{ ok: true } | { error: string }> {
  if (!["PENDING", "DONE", "NOT_FOUND", "EXEMPT"].includes(status)) return { error: "Unknown status" };
  const r = await getDsr(requestId);
  if (!r) return { error: "Request not found" };
  if (r.statusCode === "COMPLETED" || r.statusCode === "REJECTED") return { error: "This request is closed" };
  if (status === "EXEMPT" && !note?.trim()) return { error: "Say why this table is exempt (e.g. the legal hold or retention obligation)" };
  const res = await sql`
    UPDATE bayanat.data_subject_request_items SET status_code = ${status}, note = ${note?.trim() || null}, updated_by_user_id = ${userId}, updated_at = now()
    WHERE item_id = ${itemId} AND request_id = ${requestId}
  `;
  if (res.count === 0) return { error: "Item not found" };
  await sql`UPDATE bayanat.data_subject_requests SET status_code = 'IN_PROGRESS', updated_at = now() WHERE request_id = ${requestId} AND status_code = 'OPEN'`;
  await logUpdate("DATA_SUBJECT_REQUEST", requestId, userId, [{ field: `item ${itemId}`, oldVal: null, newVal: status }]).catch(() => {});
  return { ok: true };
}

export async function updateDsr(requestId: number, patch: {
  action?: "COMPLETE" | "REJECT" | "EXTEND" | "REOPEN"; responseSummary?: string; reason?: string; newDueDate?: string; notes?: string;
}, userId: string): Promise<{ ok: true } | { error: string }> {
  const r = await getDsr(requestId);
  if (!r) return { error: "Request not found" };
  if (patch.action === "COMPLETE") {
    if (r.itemsOpen > 0) return { error: `${r.itemsOpen} table(s) are still pending — mark each one done, not found or exempt first` };
    if (!patch.responseSummary?.trim()) return { error: "Summarise the response sent to the data subject" };
    await sql`UPDATE bayanat.data_subject_requests SET status_code = 'COMPLETED', response_summary = ${patch.responseSummary.trim()}, completed_at = now(), updated_at = now() WHERE request_id = ${requestId}`;
  } else if (patch.action === "REJECT") {
    if (!patch.reason?.trim()) return { error: "Give the reason for rejecting the request" };
    await sql`UPDATE bayanat.data_subject_requests SET status_code = 'REJECTED', response_summary = ${patch.reason.trim()}, completed_at = now(), updated_at = now() WHERE request_id = ${requestId}`;
  } else if (patch.action === "EXTEND") {
    if (!patch.reason?.trim() || !patch.newDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(patch.newDueDate)) return { error: "Give the new due date and the reason for the extension" };
    if (patch.newDueDate <= r.dueDate) return { error: "The new due date must be later than the current one" };
    await sql`UPDATE bayanat.data_subject_requests SET due_date = ${patch.newDueDate}::date, extension_reason = ${patch.reason.trim()}, updated_at = now() WHERE request_id = ${requestId}`;
  } else if (patch.action === "REOPEN") {
    await sql`UPDATE bayanat.data_subject_requests SET status_code = 'IN_PROGRESS', completed_at = NULL, updated_at = now() WHERE request_id = ${requestId}`;
  } else if (patch.notes !== undefined) {
    await sql`UPDATE bayanat.data_subject_requests SET notes = ${patch.notes.trim() || null}, updated_at = now() WHERE request_id = ${requestId}`;
  } else return { error: "Nothing to change" };
  await logUpdate("DATA_SUBJECT_REQUEST", requestId, userId, [{ field: patch.action ?? "notes", oldVal: r.statusCode, newVal: patch.action === "EXTEND" ? patch.newDueDate! : patch.action ?? "notes" }]).catch(() => {});
  return { ok: true };
}

/** Tell each table's owners/stewards what the request needs from them. */
export async function notifyDsrOwners(requestId: number, userId: string): Promise<number> {
  const m = await buildDsrManifest(requestId);
  if (!m) return 0;
  const byPerson = new Map<string, string[]>();
  for (const t of m.tables) {
    if (t.item?.status && t.item.status !== "PENDING") continue;
    for (const person of await resolveAssetSteward("DATA_ENTITIES", t.entityId).catch(() => [] as string[])) {
      if (person === userId) continue;
      byPerson.set(person, [...(byPerson.get(person) ?? []), `${t.name}: ${t.action.toLowerCase()}`]);
    }
  }
  for (const [person, lines] of byPerson) {
    await createNotification({
      userId: person, type: "WORKFLOW", severity: m.request.daysLeft <= 7 ? "WARNING" : "INFO",
      title: `Data subject request ${m.request.referenceCode} — due ${m.request.dueDate}`,
      body: lines.slice(0, 6).join("; ") + (lines.length > 6 ? ` (+${lines.length - 6} more)` : ""),
      actionLabel: "Open request", actionHref: `/privacy?tab=dsr&dsr=${requestId}`,
    }).catch(() => {});
  }
  return byPerson.size;
}
