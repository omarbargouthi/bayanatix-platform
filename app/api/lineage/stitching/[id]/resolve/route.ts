import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logUpdate } from "@/lib/audit";
import type { ExternalRef } from "@/lib/lineage/stitching";

type Ctx = { params: { id: string } };

// Re-points every data_lineage edge (entity- and attribute-level) that currently
// references the placeholder entity/its attributes onto the real target entity,
// creating matching attributes on the target by name where needed.
async function repointEdges(placeholderEntityId: number, targetEntityId: number) {
  await sql`
    UPDATE bayanat.data_lineage SET source_asset_id = ${targetEntityId}
    WHERE lineage_scope_code = 'ENTITY_LEVEL' AND source_asset_id = ${placeholderEntityId}
  `;
  await sql`
    UPDATE bayanat.data_lineage SET target_asset_id = ${targetEntityId}
    WHERE lineage_scope_code = 'ENTITY_LEVEL' AND target_asset_id = ${placeholderEntityId}
  `;

  const placeholderAttrs = await sql<{ id: number; name: string; dataType: string | null }[]>`
    SELECT attribute_id AS id, physical_name_text AS name, data_type_text AS "dataType" FROM bayanat.data_attributes WHERE entity_id = ${placeholderEntityId}
  `;
  for (const attr of placeholderAttrs) {
    const [existing] = await sql<{ id: number }[]>`
      SELECT attribute_id AS id FROM bayanat.data_attributes WHERE entity_id = ${targetEntityId} AND lower(physical_name_text) = lower(${attr.name})
    `;
    const targetAttrId = existing?.id ?? (
      await sql<{ id: number }[]>`
        INSERT INTO bayanat.data_attributes (entity_id, physical_name_text, friendly_name_text, data_type_text)
        VALUES (${targetEntityId}, ${attr.name}, ${attr.name}, ${attr.dataType ?? "unknown"})
        RETURNING attribute_id AS id
      `
    )[0].id;
    await sql`UPDATE bayanat.data_lineage SET source_asset_id = ${targetAttrId} WHERE lineage_scope_code = 'ATTRIBUTE_LEVEL' AND source_asset_id = ${attr.id}`;
    await sql`UPDATE bayanat.data_lineage SET target_asset_id = ${targetAttrId} WHERE lineage_scope_code = 'ATTRIBUTE_LEVEL' AND target_asset_id = ${attr.id}`;
  }
}

async function clearPlaceholder(placeholderEntityId: number) {
  await sql`UPDATE bayanat.lineage_stitch_queue SET placeholder_entity_id = NULL WHERE placeholder_entity_id = ${placeholderEntityId}`;
  await sql`DELETE FROM bayanat.asset_external_ids WHERE asset_type_code = 'DATA_ENTITIES' AND asset_id = ${placeholderEntityId}`;
  await sql`DELETE FROM bayanat.data_attributes WHERE entity_id = ${placeholderEntityId}`;
  await sql`DELETE FROM bayanat.data_entities WHERE entity_id = ${placeholderEntityId}`;
}

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const stitchId = Number(params.id);
  if (!Number.isFinite(stitchId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await sql<{ externalRef: ExternalRef; placeholderEntityId: number | null; statusCode: string }[]>`
    SELECT external_ref AS "externalRef", placeholder_entity_id AS "placeholderEntityId", status_code AS "statusCode"
    FROM bayanat.lineage_stitch_queue WHERE stitch_id = ${stitchId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.statusCode !== "OPEN") return NextResponse.json({ error: `Already ${row.statusCode.toLowerCase()}` }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (!["BIND", "ALIAS", "DISMISS"].includes(action)) return NextResponse.json({ error: "action must be BIND, ALIAS, or DISMISS" }, { status: 400 });

  try {
    if (action === "DISMISS") {
      await sql`UPDATE bayanat.lineage_stitch_queue SET status_code = 'DISMISSED', resolved_by_user_id = ${session.userId}, resolved_at_timestamp = now() WHERE stitch_id = ${stitchId}`;
      await logUpdate("DATA_ENTITIES", row.placeholderEntityId ?? 0, session.userId, [{ field: "stitch_queue", oldVal: "OPEN", newVal: "DISMISSED" }]);
      return NextResponse.json({ ok: true });
    }

    // Both BIND and ALIAS need a target entity. Resolve it either directly (assetId)
    // or by re-matching the queued external_ref's schema/object under a chosen connection.
    let targetEntityId: number | null = Number.isFinite(Number(body.assetId)) ? Number(body.assetId) : null;
    const connectionId = Number.isFinite(Number(body.connectionId)) ? Number(body.connectionId) : null;

    if (!targetEntityId && connectionId) {
      const [conn] = await sql<{ hostAddress: string; databaseName: string | null; dbTypeCode: string }[]>`
        SELECT host_address AS "hostAddress", database_name AS "databaseName", db_type_code AS "dbTypeCode" FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
      `;
      if (!conn) return NextResponse.json({ error: "Unknown connectionId" }, { status: 400 });
      const [ds] = await sql<{ id: number }[]>`
        SELECT data_source_id AS id FROM bayanat.data_sources WHERE source_type_code = ${conn.dbTypeCode} AND connection_id = ${connectionId}
      `;
      const [dsFallback] = ds ? [ds] : await sql<{ id: number }[]>`
        SELECT data_source_id AS id FROM bayanat.data_sources WHERE source_type_code = ${conn.dbTypeCode} AND lower(host_address_text) = lower(${conn.hostAddress}) LIMIT 1
      `;
      const dataSourceId = ds?.id ?? dsFallback?.id;
      if (!dataSourceId) return NextResponse.json({ error: "No cataloged data source found for that connection — crawl it first, or bind by assetId instead." }, { status: 400 });

      const schemaFilter = row.externalRef.schema;
      const [schema] = schemaFilter
        ? await sql<{ id: number }[]>`SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${dataSourceId} AND lower(schema_name_text) = lower(${schemaFilter})`
        : [];
      const schemaIds = schema ? [schema] : (await sql<{ id: number }[]>`SELECT schema_id AS id FROM bayanat.data_schemas WHERE data_source_id = ${dataSourceId}`);
      for (const s of schemaIds) {
        const [entity] = await sql<{ id: number }[]>`SELECT entity_id AS id FROM bayanat.data_entities WHERE schema_id = ${s.id} AND lower(entity_name_text) = lower(${row.externalRef.object})`;
        if (entity) { targetEntityId = entity.id; break; }
      }
      if (!targetEntityId) return NextResponse.json({ error: `No asset named "${row.externalRef.object}" found under that connection's catalog — try binding by assetId instead.` }, { status: 400 });

      if (action === "ALIAS") {
        const fingerprint = `${row.externalRef.engine}|${row.externalRef.host ?? ""}|${row.externalRef.database ?? ""}`.toLowerCase();
        await sql`
          INSERT INTO bayanat.lineage_connection_aliases (connection_id, engine_code, alias_fingerprint_text, created_by_user_id)
          VALUES (${connectionId}, ${row.externalRef.engine}, ${fingerprint}, ${session.userId})
          ON CONFLICT (engine_code, alias_fingerprint_text) DO NOTHING
        `;
      }
    }

    if (!targetEntityId) return NextResponse.json({ error: "assetId or a connectionId that resolves to a real asset is required" }, { status: 400 });
    if (!row.placeholderEntityId) return NextResponse.json({ error: "This queue row has no placeholder to re-point (already cleared)" }, { status: 409 });

    await repointEdges(row.placeholderEntityId, targetEntityId);
    await sql`UPDATE bayanat.lineage_stitch_queue SET status_code = 'RESOLVED', resolved_by_user_id = ${session.userId}, resolved_at_timestamp = now(), placeholder_entity_id = NULL WHERE stitch_id = ${stitchId}`;
    await clearPlaceholder(row.placeholderEntityId);

    await logUpdate("DATA_ENTITIES", targetEntityId, session.userId, [
      { field: "stitch_queue", oldVal: "OPEN", newVal: `${action} -> entity #${targetEntityId}` },
    ]);
    return NextResponse.json({ ok: true, targetEntityId });
  } catch (err) {
    console.error("[stitching resolve]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Resolve failed" }, { status: 500 });
  }
}
