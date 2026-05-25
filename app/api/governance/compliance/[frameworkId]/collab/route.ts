import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

// GET /api/governance/compliance/[frameworkId]/collab?reqIds=1,2,3
// Returns { counts: { "1": 2, "3": 1 } }
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("reqIds") ?? "";
  const reqIds = raw.split(",").map(Number).filter((n) => !isNaN(n) && n > 0);
  if (reqIds.length === 0) return NextResponse.json({ counts: {} });

  const rows = await sql<{ reqId: string; cnt: number }[]>`
    SELECT ar.asset_id AS "reqId", COUNT(DISTINCT ar.thread_id)::int AS cnt
    FROM bayanat.collab_asset_refs ar
    WHERE ar.asset_type = 'COMPLIANCE_EVIDENCE'
      AND ar.asset_id   = ANY(${reqIds.map(String)})
    GROUP BY ar.asset_id
  `;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.reqId] = r.cnt;
  return NextResponse.json({ counts });
}
