import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ingestPbixFile } from "@/lib/lineage/pbix-parser";

// .pbix upload mode: POST multipart { file: .pbix, connectionId: the POWERBI/FABRIC
// connection_registry row to attach the resulting lineage edges/process rows to }.
// Only the file's embedded Power Query (M) definitions are parsed — see
// lib/lineage/pbix-parser.ts for why DAX measures aren't reachable this way.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN" && session.role !== "STEWARD") {
    return NextResponse.json({ error: "Forbidden — steward or admin only" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  const connectionIdRaw = form.get("connectionId");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required (.pbix)" }, { status: 400 });
  const connectionId = Number(connectionIdRaw);
  if (!Number.isFinite(connectionId)) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });

  const [conn] = await sql<{ dbTypeCode: string }[]>`SELECT db_type_code AS "dbTypeCode" FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
  if (!conn) return NextResponse.json({ error: "Unknown connectionId" }, { status: 400 });
  if (conn.dbTypeCode !== "POWERBI" && conn.dbTypeCode !== "FABRIC") {
    return NextResponse.json({ error: "connectionId must reference a db_type_code='POWERBI' or 'FABRIC' connection" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pbix")) {
    return NextResponse.json({ error: "Only .pbix files are supported" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const result = await ingestPbixFile(buf, file.name, session.userId, connectionId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[pbix upload]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Power BI file parse failed" }, { status: 500 });
  }
}
