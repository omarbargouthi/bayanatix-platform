import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = Number(params.id);
  if (!Number.isFinite(runId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await sql<{
    runId: number; scopeType: string; scopeId: number | null; triggeredBy: string | null;
    status: string; startedAt: string; finishedAt: string | null;
    attributesEvaluated: number; suggestionsChanged: number; summary: unknown;
  }[]>`
    SELECT run_id AS "runId", scope_type_code AS "scopeType", scope_id AS "scopeId",
           triggered_by_user_id AS "triggeredBy", status_code AS status,
           started_at::text AS "startedAt", finished_at::text AS "finishedAt",
           coalesce(attributes_evaluated_count,0) AS "attributesEvaluated",
           coalesce(suggestions_changed_count,0) AS "suggestionsChanged",
           summary_json AS summary
    FROM bayanat.classification_runs WHERE run_id = ${runId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
