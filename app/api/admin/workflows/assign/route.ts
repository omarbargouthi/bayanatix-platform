import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestTypeCode, workflowId } = await req.json();
  const VALID_TYPES = ["FIX_DATA_ISSUE","UPDATE_DEFINITION","CERTIFY_ASSET","GRANT_ACCESS","REMOVE_ACCESS","OTHER"];
  if (!VALID_TYPES.includes(requestTypeCode))
    return NextResponse.json({ error: "Invalid requestTypeCode" }, { status: 400 });

  if (workflowId === null) {
    await sql`DELETE FROM bayanat.request_type_workflows WHERE request_type_code = ${requestTypeCode}`;
  } else {
    await sql`
      INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
      VALUES (${requestTypeCode}, ${Number(workflowId)})
      ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id
    `;
  }
  return NextResponse.json({ ok: true });
}
