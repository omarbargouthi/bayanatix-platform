import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestTypeCode, workflowId } = await req.json();
  const VALID_TYPES = [
    "FIX_DATA_ISSUE", "UPDATE_DEFINITION", "CERTIFY_ASSET", "GRANT_ACCESS", "REMOVE_ACCESS", "OTHER",
    "CLASSIFY_ASSET", "COMPLIANCE_REVIEW", "PUBLISH_OPEN_DATA", "PUBLISH_OPEN_DATA_PI",
  ];
  if (!VALID_TYPES.includes(requestTypeCode))
    return NextResponse.json({ error: "Invalid requestTypeCode" }, { status: 400 });

  if (workflowId === null) {
    await sql`DELETE FROM bayanat.request_type_workflows WHERE request_type_code = ${requestTypeCode}`;
  } else {
    const [wf] = await sql<{ statusCode: string }[]>`
      SELECT status_code AS "statusCode" FROM bayanat.workflow_definitions WHERE workflow_id = ${Number(workflowId)}
    `;
    if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    if (wf.statusCode === "Draft") {
      return NextResponse.json({ error: "Cannot assign a Draft workflow — activate it first" }, { status: 400 });
    }

    await sql`
      INSERT INTO bayanat.request_type_workflows (request_type_code, workflow_id)
      VALUES (${requestTypeCode}, ${Number(workflowId)})
      ON CONFLICT (request_type_code) DO UPDATE SET workflow_id = EXCLUDED.workflow_id
    `;
  }
  return NextResponse.json({ ok: true });
}
