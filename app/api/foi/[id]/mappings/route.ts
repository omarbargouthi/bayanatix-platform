import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

// Codes that map 1-to-1 to classification_types.class_code (FOI sensitivity)
const VALID_SENSITIVITY = new Set(["PUBLIC","INTERNAL","CONFIDENTIAL","RESTRICTED","SECRET","TOP_SECRET"]);
const BLOCKED_SENSITIVITY = new Set(["CONFIDENTIAL","RESTRICTED","SECRET","TOP_SECRET"]);

function classStatusFor(code: string | null | undefined): "PENDING" | "CLEARED" | "BLOCKED" {
  if (!code || !VALID_SENSITIVITY.has(code)) return "PENDING";
  return BLOCKED_SENSITIVITY.has(code) ? "BLOCKED" : "CLEARED";
}

// GET — all mappings with collaboration thread
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql`
    SELECT
      m.mapping_id              AS "mappingId",
      m.req_attr_id             AS "reqAttrId",
      a.attribute_name_text     AS "requestedAttributeName",
      a.description_text        AS "requestedAttributeDesc",
      a.format_hint_text        AS "requestedFormatHint",
      m.source_type             AS "sourceType",
      m.data_source_id          AS "dataSourceId",
      ds.source_name_text       AS "dataSourceName",
      m.data_entity_id          AS "dataEntityId",
      de.entity_name_text       AS "dataEntityName",
      COALESCE(de.display_name_text, de.entity_name_text) AS "dataEntityDisplayName",
      m.data_attribute_id       AS "dataAttributeId",
      da.physical_name_text     AS "dataAttributeName",
      COALESCE(da.friendly_name_text, da.physical_name_text) AS "dataAttributeDisplayName",
      da.data_type_text         AS "dataType",
      m.manual_system_name      AS "manualSystemName",
      m.manual_entity_name      AS "manualEntityName",
      m.manual_column_name      AS "manualColumnName",
      m.sensitivity_code        AS "sensitivityCode",
      ct.class_name_text        AS "sensitivityLabel",
      m.catalog_class_code      AS "catalogClassCode",
      m.classification_status   AS "classificationStatus",
      m.classification_notes    AS "classificationNotes",
      m.quality_status          AS "qualityStatus",
      m.quality_notes           AS "qualityNotes",
      m.officer_notes           AS "officerNotes",
      m.steward_notified_at     AS "stewardNotifiedAt",
      m.updated_at              AS "updatedAt",
      -- Live DQ info: rules covering this attribute (attribute-level OR entity-level)
      CASE WHEN m.data_attribute_id IS NULL OR m.source_type != 'CATALOG' THEN 0 ELSE (
        SELECT COUNT(*) FROM bayanat.dq_rules ru
        WHERE ru.is_active_indicator = true
          AND (
            (ru.asset_type_code = 'DATA_ATTRIBUTES' AND ru.asset_id = m.data_attribute_id)
            OR (ru.asset_type_code = 'DATA_ENTITIES' AND ru.asset_id = da.entity_id)
          )
      ) END                     AS "dqRulesCount",
      CASE WHEN m.data_attribute_id IS NULL OR m.source_type != 'CATALOG' THEN NULL ELSE (
        SELECT r.status_code FROM bayanat.dq_results r
        JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
        WHERE (
          (ru.asset_type_code = 'DATA_ATTRIBUTES' AND ru.asset_id = m.data_attribute_id)
          OR (ru.asset_type_code = 'DATA_ENTITIES' AND ru.asset_id = da.entity_id)
        )
        ORDER BY r.execution_timestamp DESC LIMIT 1
      ) END                     AS "dqLatestStatus",
      CASE WHEN m.data_attribute_id IS NULL OR m.source_type != 'CATALOG' THEN NULL ELSE (
        SELECT r.failure_percentage_number FROM bayanat.dq_results r
        JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
        WHERE (
          (ru.asset_type_code = 'DATA_ATTRIBUTES' AND ru.asset_id = m.data_attribute_id)
          OR (ru.asset_type_code = 'DATA_ENTITIES' AND ru.asset_id = da.entity_id)
        )
        ORDER BY r.execution_timestamp DESC LIMIT 1
      ) END                     AS "dqLatestFailPct",
      CASE WHEN m.data_attribute_id IS NULL OR m.source_type != 'CATALOG' THEN NULL ELSE (
        SELECT r.execution_timestamp FROM bayanat.dq_results r
        JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
        WHERE (
          (ru.asset_type_code = 'DATA_ATTRIBUTES' AND ru.asset_id = m.data_attribute_id)
          OR (ru.asset_type_code = 'DATA_ENTITIES' AND ru.asset_id = da.entity_id)
        )
        ORDER BY r.execution_timestamp DESC LIMIT 1
      ) END                     AS "dqLatestRunAt"
    FROM bayanat.foi_attribute_mappings m
    JOIN bayanat.foi_requested_attributes a ON a.req_attr_id = m.req_attr_id
    LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = m.data_source_id
    LEFT JOIN bayanat.data_entities de ON de.entity_id = m.data_entity_id
    LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
    LEFT JOIN bayanat.classification_types ct ON ct.class_code = m.sensitivity_code
    WHERE m.foi_request_id = ${id}
    ORDER BY a.sort_order, m.mapping_id
  `;

  // Fetch collaboration threads for all mappings in one query
  const typedRows = rows as unknown as Array<{ mappingId: number }>;
  const mappingIds = typedRows.map(r => r.mappingId).filter(Boolean);
  let threads: Record<number, CollabNote[]> = {};
  if (mappingIds.length > 0) {
    const notes = await sql`
      SELECT
        c.comm_id        AS "commId",
        c.mapping_id     AS "mappingId",
        c.body_text      AS "body",
        c.sent_at        AS "sentAt",
        c.direction_code AS "direction",
        COALESCE(u.full_name, 'System') AS "senderName"
      FROM bayanat.foi_communications c
      LEFT JOIN bayanat.users u ON u.user_id = c.sent_by_user_id
      WHERE c.mapping_id = ANY(${mappingIds}::int[])
      ORDER BY c.sent_at ASC
    `;
    for (const n of notes as unknown as CollabNote[]) {
      if (!threads[n.mappingId]) threads[n.mappingId] = [];
      threads[n.mappingId].push(n);
    }
  }

  const result = typedRows.map(r => ({
    ...r,
    collaborationThread: threads[r.mappingId] ?? [],
  }));

  return NextResponse.json(result);
}

type CollabNote = { commId: number; mappingId: number; body: string; sentAt: string; direction: string; senderName: string };

// POST — upsert a single mapping
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reqAttrId = Number(body.reqAttrId);
  if (!Number.isFinite(reqAttrId)) return NextResponse.json({ error: "reqAttrId required" }, { status: 400 });
  if (!["CATALOG","MANUAL"].includes(body.sourceType)) {
    return NextResponse.json({ error: "sourceType must be CATALOG or MANUAL" }, { status: 400 });
  }

  try {
    let catalogClassCode: string | null = null;
    let resolvedSensitivity: string | null = body.sensitivityCode || null;
    let classNotes: string | null = body.classificationNotes?.trim() || null;

    if (body.sourceType === "CATALOG" && body.dataAttributeId) {
      const [catAttr] = await sql`
        SELECT COALESCE(bg.classification_code, a.classification_code) AS classification_code
        FROM bayanat.data_attributes a
        LEFT JOIN bayanat.asset_business_terms abt
          ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
        LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
        WHERE a.attribute_id = ${Number(body.dataAttributeId)}
      `;
      // Store the resolved catalog code (business terms first, legacy field as fallback)
      catalogClassCode = catAttr?.classification_code ?? null;

      if (!resolvedSensitivity) {
        if (catalogClassCode && VALID_SENSITIVITY.has(catalogClassCode)) {
          // Direct 1-to-1 map: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, SECRET, TOP_SECRET
          resolvedSensitivity = catalogClassCode;
        } else if (catalogClassCode) {
          // Non-standard code (PII, SENSITIVE, etc.) — officer must set manually
          classNotes = classNotes ?? `Catalog classification "${catalogClassCode}" requires officer review — please set the FOI sensitivity classification manually.`;
        } else {
          // No classification in catalog at all
          classNotes = classNotes ?? "Column is not classified in the data catalog. Coordinate with the data steward to obtain the classification before proceeding.";
        }
      }
    }

    const classStatus = classStatusFor(resolvedSensitivity);

    await sql`DELETE FROM bayanat.foi_attribute_mappings WHERE foi_request_id = ${id} AND req_attr_id = ${reqAttrId}`;

    const [row] = await sql`
      INSERT INTO bayanat.foi_attribute_mappings (
        foi_request_id, req_attr_id, source_type,
        data_source_id, data_entity_id, data_attribute_id,
        manual_system_name, manual_entity_name, manual_column_name,
        sensitivity_code, catalog_class_code, classification_status, classification_notes,
        quality_status, officer_notes, mapped_by_user_id
      ) VALUES (
        ${id}, ${reqAttrId}, ${body.sourceType},
        ${body.dataSourceId ?? null}, ${body.dataEntityId ?? null}, ${body.dataAttributeId ?? null},
        ${body.manualSystemName?.trim() || null}, ${body.manualEntityName?.trim() || null}, ${body.manualColumnName?.trim() || null},
        ${resolvedSensitivity}, ${catalogClassCode}, ${classStatus}, ${classNotes},
        'PENDING', ${body.officerNotes?.trim() || null}, ${session.userId}
      )
      RETURNING mapping_id AS "mappingId",
                classification_status AS "classificationStatus",
                catalog_class_code AS "catalogClassCode",
                sensitivity_code AS "sensitivityCode"
    `;
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[FOI MAPPINGS POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// PATCH — quality check | notify steward | add collaboration note | mark classified
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // ── Quality check ────────────────────────────────────────────────────────
    if (body.action === "RUN_QUALITY_CHECK") {
      // Catalog mappings: check DQ rules at attribute-level and entity-level
      const catalogMaps = await sql`
        SELECT m.mapping_id, m.data_attribute_id, da.entity_id
        FROM bayanat.foi_attribute_mappings m
        JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
        WHERE m.foi_request_id = ${id} AND m.source_type = 'CATALOG' AND m.data_attribute_id IS NOT NULL
      `;
      for (const m of catalogMaps) {
        // Count active DQ rules covering this attribute (attribute-level OR entity-level)
        const [ruleCount] = await sql`
          SELECT COUNT(*) AS cnt FROM bayanat.dq_rules
          WHERE is_active_indicator = true
            AND (
              (asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${m.data_attribute_id})
              OR (asset_type_code = 'DATA_ENTITIES' AND asset_id = ${m.entity_id})
            )
        `;
        if (Number(ruleCount.cnt) === 0) {
          await sql`
            UPDATE bayanat.foi_attribute_mappings SET
              quality_status = 'CLEARED',
              quality_notes  = 'No data quality indicator available for this column',
              updated_at = NOW()
            WHERE mapping_id = ${m.mapping_id}
          `;
          continue;
        }
        // Get latest DQ result for rules covering this attribute
        const [dqRow] = await sql`
          SELECT r.status_code, r.failure_percentage_number, r.execution_timestamp
          FROM bayanat.dq_results r
          JOIN bayanat.dq_rules ru ON ru.rule_id = r.rule_id
          WHERE ru.is_active_indicator = true
            AND (
              (ru.asset_type_code = 'DATA_ATTRIBUTES' AND ru.asset_id = ${m.data_attribute_id})
              OR (ru.asset_type_code = 'DATA_ENTITIES' AND ru.asset_id = ${m.entity_id})
            )
          ORDER BY r.execution_timestamp DESC LIMIT 1
        `;
        if (!dqRow) {
          await sql`
            UPDATE bayanat.foi_attribute_mappings SET
              quality_status = 'PENDING',
              quality_notes  = 'DQ rules are defined but have not been executed yet',
              updated_at = NOW()
            WHERE mapping_id = ${m.mapping_id}
          `;
        } else {
          const passed  = dqRow.status_code === 'PASSED';
          const failPct = Number(dqRow.failure_percentage_number ?? 0);
          await sql`
            UPDATE bayanat.foi_attribute_mappings SET
              quality_status = ${passed ? 'CLEARED' : 'FLAGGED'},
              quality_notes  = ${passed
                ? `DQ passed — ${(100 - failPct).toFixed(1)}% pass rate (checked ${new Date(dqRow.execution_timestamp).toLocaleDateString()})`
                : `DQ issues detected — ${failPct.toFixed(1)}% failure rate (checked ${new Date(dqRow.execution_timestamp).toLocaleDateString()})`},
              updated_at = NOW()
            WHERE mapping_id = ${m.mapping_id}
          `;
        }
      }
      // Manual source mappings: no automated DQ
      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          quality_status = 'CLEARED',
          quality_notes  = 'Manual source — no automated DQ indicator',
          updated_at = NOW()
        WHERE foi_request_id = ${id} AND source_type = 'MANUAL' AND quality_status = 'PENDING'
      `;
      return NextResponse.json({ ok: true });
    }

    // ── Add collaboration note (steward coordination thread) ──────────────────
    if (body.action === "ADD_COLLABORATION_NOTE") {
      const mappingId = Number(body.mappingId);
      if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });
      if (!body.note?.trim()) return NextResponse.json({ error: "note required" }, { status: 400 });

      const [ctx] = await sql`
        SELECT r.reference_code,
               COALESCE(da.friendly_name_text, da.physical_name_text, m.manual_column_name, 'column') AS col_name
        FROM bayanat.foi_attribute_mappings m
        JOIN bayanat.foi_requests r ON r.foi_request_id = m.foi_request_id
        LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
        WHERE m.mapping_id = ${mappingId} AND m.foi_request_id = ${id}
      `;
      if (!ctx) return NextResponse.json({ error: "Mapping not found" }, { status: 404 });

      const subject = `${ctx.reference_code} | ${ctx.col_name} — Classification Discussion`;

      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, mapping_id, direction_code, message_type_code,
           subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (
          ${id}, ${mappingId}, 'INTERNAL', 'STEWARD_COORDINATION',
          ${subject}, ${body.note.trim()},
          'INTERNAL', ${session.userId}
        )
      `;

      // First note also stamps steward_notified_at
      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          steward_notified_at = COALESCE(steward_notified_at, NOW()),
          updated_at = NOW()
        WHERE mapping_id = ${mappingId}
      `;

      return NextResponse.json({ ok: true });
    }

    // ── Mark classified — officer receives classification from steward ─────────
    if (body.action === "MARK_CLASSIFIED") {
      const mappingId = Number(body.mappingId);
      if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });
      const sensitivityCode: string = body.sensitivityCode;
      if (!VALID_SENSITIVITY.has(sensitivityCode)) {
        return NextResponse.json({ error: "Invalid sensitivity code" }, { status: 400 });
      }
      const classStatus = classStatusFor(sensitivityCode);

      const [ctx] = await sql`
        SELECT r.reference_code,
               COALESCE(da.friendly_name_text, da.physical_name_text, m.manual_column_name, 'column') AS col_name
        FROM bayanat.foi_attribute_mappings m
        JOIN bayanat.foi_requests r ON r.foi_request_id = m.foi_request_id
        LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
        WHERE m.mapping_id = ${mappingId} AND m.foi_request_id = ${id}
      `;

      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          sensitivity_code = ${sensitivityCode},
          classification_status = ${classStatus},
          classification_notes = ${body.notes?.trim() || null},
          updated_at = NOW()
        WHERE mapping_id = ${mappingId} AND foi_request_id = ${id}
      `;

      const subject = ctx
        ? `${ctx.reference_code} | ${ctx.col_name} — Classification Confirmed`
        : 'Classification Confirmed';
      const noteBody = `Classification set to ${sensitivityCode}` + (body.notes ? `: ${body.notes.trim()}` : '');

      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, mapping_id, direction_code, message_type_code,
           subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (
          ${id}, ${mappingId}, 'INTERNAL', 'STEWARD_COORDINATION',
          ${subject}, ${noteBody},
          'INTERNAL', ${session.userId}
        )
      `;
      return NextResponse.json({ ok: true });
    }

    // ── Notify steward (legacy — kept for backward compat) ────────────────────
    if (body.action === "NOTIFY_STEWARD") {
      const mappingId = Number(body.mappingId);
      if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });
      const [mapping] = await sql`
        SELECT m.mapping_id, a.attribute_name_text, r.reference_code, r.subject_text,
               da.physical_name_text AS attr_name, COALESCE(da.friendly_name_text, da.physical_name_text) AS attr_display,
               de.entity_name_text, ds.source_name_text
        FROM bayanat.foi_attribute_mappings m
        JOIN bayanat.foi_requested_attributes a ON a.req_attr_id = m.req_attr_id
        JOIN bayanat.foi_requests r ON r.foi_request_id = m.foi_request_id
        LEFT JOIN bayanat.data_attributes da ON da.attribute_id = m.data_attribute_id
        LEFT JOIN bayanat.data_entities de ON de.entity_id = m.data_entity_id
        LEFT JOIN bayanat.data_sources ds ON ds.data_source_id = m.data_source_id
        WHERE m.mapping_id = ${mappingId} AND m.foi_request_id = ${id}
      `;
      if (!mapping) return NextResponse.json({ error: "Mapping not found" }, { status: 404 });

      const msg = body.message?.trim()
        || `Classification required for column "${mapping.attr_display ?? mapping.attr_name}" (table: ${mapping.entity_name_text ?? "—"}, source: ${mapping.source_name_text ?? "—"}) to fulfil FOI ${mapping.reference_code}: "${mapping.subject_text}". Please classify this column at your earliest convenience.`;

      await sql`
        INSERT INTO bayanat.foi_communications
          (foi_request_id, mapping_id, direction_code, message_type_code,
           subject_text, body_text, channel_code, sent_by_user_id)
        VALUES (
          ${id}, ${mappingId}, 'INTERNAL', 'STEWARD_COORDINATION',
          ${'Classification request: ' + (mapping.attr_display ?? mapping.attr_name ?? 'column')},
          ${msg}, 'INTERNAL', ${session.userId}
        )
      `;
      await sql`
        UPDATE bayanat.foi_attribute_mappings SET
          steward_notified_at = COALESCE(steward_notified_at, NOW()), updated_at = NOW()
        WHERE mapping_id = ${mappingId}
      `;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[FOI MAPPINGS PATCH]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}

// DELETE — remove a mapping
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  const { searchParams } = new URL(req.url);
  const mappingId = Number(searchParams.get("mappingId"));
  if (!Number.isFinite(mappingId)) return NextResponse.json({ error: "mappingId required" }, { status: 400 });

  await sql`DELETE FROM bayanat.foi_attribute_mappings WHERE mapping_id = ${mappingId} AND foi_request_id = ${id}`;
  return NextResponse.json({ ok: true });
}
