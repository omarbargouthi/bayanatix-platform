import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { scanPbixFolder } from "@/lib/lineage/pbix-folder-scan";

// Hit by lib/lineage/pbix-scheduler.ts's node-cron tick (Authorization: Bearer
// CRON_SECRET — same convention as app/api/reports/cron/snapshot). Scans every
// active PBIX_FOLDER connection with lineage_enabled=true; each file is only
// re-ingested if its mtime changed since the last scan (see pbix-folder-scan.ts).
const SYSTEM_TRIGGERED_BY = "SYSTEM";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await sql<{ connectionId: number; connectionName: string }[]>`
    SELECT connection_id AS "connectionId", connection_name AS "connectionName"
    FROM bayanat.connection_registry
    WHERE db_type_code = 'PBIX_FOLDER' AND coalesce(is_active_boolean, true) AND coalesce(lineage_enabled, false)
  `;

  const results = [];
  for (const c of connections) {
    try {
      const r = await scanPbixFolder(c.connectionId, SYSTEM_TRIGGERED_BY, { force: false });
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, ...r });
    } catch (err) {
      results.push({ connectionId: c.connectionId, connectionName: c.connectionName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ connectionsScanned: connections.length, results });
}
