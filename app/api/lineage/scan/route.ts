import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { runLineageScan } from "@/lib/lineage-scanner";
import { ingestPowerBiScanResult } from "@/lib/lineage/powerbi-ingester";

// Dispatches by connection_registry.db_type_code (v2 extends v1's Postgres-only
// dispatch). POWERBI/FABRIC only support the dev-only fixturePath test mode in
// this build (§8 acceptance scenario) — no live Admin scanner API client yet.
// ORACLE/MSSQL/SSISDB live scanning are out of scope for this build (SSIS still
// has its own upload-mode route at /api/lineage/ssis/upload).
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

  const [conn] = await sql<{ dbTypeCode: string }[]>`SELECT db_type_code AS "dbTypeCode" FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
  if (!conn) return NextResponse.json({ error: "Unknown connectionId" }, { status: 400 });

  try {
    if (conn.dbTypeCode === "POSTGRES") {
      const { scanRunId } = await runLineageScan(connectionId, session.userId);
      return NextResponse.json({ scanRunId }, { status: 201 });
    }

    if ((conn.dbTypeCode === "POWERBI" || conn.dbTypeCode === "FABRIC") && typeof body.fixturePath === "string") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "fixturePath scanning is a dev-only test mode, not available in production" }, { status: 403 });
      }
      const filePath = path.resolve(body.fixturePath);
      const text = await readFile(filePath, "utf8");
      const scanResult = JSON.parse(text);
      const result = await ingestPowerBiScanResult(scanResult, connectionId, session.userId);
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json({ error: `Live scanning for db_type_code='${conn.dbTypeCode}' is not implemented in this build.` }, { status: 400 });
  } catch (err) {
    console.error("[lineage scan]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
