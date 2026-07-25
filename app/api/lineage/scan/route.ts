import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runLineageScan } from "@/lib/lineage-scanner";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const connectionId = Number(body.connectionId);
  if (!Number.isFinite(connectionId)) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
  }

  try {
    const { scanRunId } = await runLineageScan(connectionId, session.userId);
    return NextResponse.json({ scanRunId }, { status: 201 });
  } catch (err) {
    console.error("[lineage scan]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
