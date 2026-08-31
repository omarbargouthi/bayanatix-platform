import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// FR-12.4 — list the stitching review queue with enough context to act on each row.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const rows = await sql<{
    stitchId: number; externalRef: unknown; candidateConnections: unknown; statusCode: string;
    createdAt: string; placeholderEntityId: number | null; placeholderEntityName: string | null;
    affectedEdgeCount: number;
  }[]>`
    SELECT
      q.stitch_id AS "stitchId",
      q.external_ref AS "externalRef",
      q.candidate_connections AS "candidateConnections",
      q.status_code AS "statusCode",
      q.created_at_timestamp::text AS "createdAt",
      q.placeholder_entity_id AS "placeholderEntityId",
      e.entity_name_text AS "placeholderEntityName",
      COALESCE((
        SELECT count(*)::int FROM bayanat.data_lineage dl
        WHERE dl.lineage_scope_code = 'ENTITY_LEVEL' AND (dl.source_asset_id = q.placeholder_entity_id OR dl.target_asset_id = q.placeholder_entity_id)
      ), 0) AS "affectedEdgeCount"
    FROM bayanat.lineage_stitch_queue q
    LEFT JOIN bayanat.data_entities e ON e.entity_id = q.placeholder_entity_id
    ORDER BY q.status_code = 'OPEN' DESC, q.created_at_timestamp DESC
  `;
  return NextResponse.json(rows);
}
