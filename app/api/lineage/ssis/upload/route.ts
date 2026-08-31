import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ingestSsisPackage } from "@/lib/lineage/ssis-parser";

// FR-8.1 upload mode: POST multipart { file: .dtsx, connectionId: the SSISDB-type
// connection_registry row this package's connection managers should stitch against }.
// (.ispac ZIP upload — multiple .dtsx inside — is a follow-up; single .dtsx first.)
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
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required (.dtsx)" }, { status: 400 });
  const connectionId = Number(connectionIdRaw);
  if (!Number.isFinite(connectionId)) return NextResponse.json({ error: "connectionId is required" }, { status: 400 });

  const [conn] = await sql<{ dbTypeCode: string }[]>`SELECT db_type_code AS "dbTypeCode" FROM bayanat.connection_registry WHERE connection_id = ${connectionId}`;
  if (!conn) return NextResponse.json({ error: "Unknown connectionId" }, { status: 400 });
  if (conn.dbTypeCode !== "SSISDB") return NextResponse.json({ error: "connectionId must reference a db_type_code='SSISDB' connection" }, { status: 400 });

  if (!file.name.toLowerCase().endsWith(".dtsx")) {
    return NextResponse.json({ error: "Only .dtsx files are supported in this build (.ispac follow-up)" }, { status: 400 });
  }

  const xmlText = await file.text();
  try {
    const result = await ingestSsisPackage(xmlText, file.name, session.userId, connectionId);
    return NextResponse.json({ scanRunId: result.scanRunId, edgesCreated: result.edgesCreated, warnings: result.warnings }, { status: 201 });
  } catch (err) {
    console.error("[ssis upload]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "SSIS package parse failed" }, { status: 500 });
  }
}
