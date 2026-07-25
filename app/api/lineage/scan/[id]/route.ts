import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scanRunId = Number(params.id);
  if (!Number.isFinite(scanRunId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [run] = await sql`
    SELECT
      scan_run_id                 AS "scanRunId",
      connection_id                AS "connectionId",
      status_code                  AS "statusCode",
      to_char(started_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "startedAt",
      to_char(finished_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "finishedAt",
      processes_scanned_count      AS "processesScanned",
      edges_created_count          AS "edgesCreated",
      edges_removed_count          AS "edgesRemoved",
      warnings,
      triggered_by_user_id         AS "triggeredByUserId"
    FROM bayanat.lineage_scan_runs WHERE scan_run_id = ${scanRunId}
  `;
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(run);
}
