import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { listWorkflows } from "@/lib/queries/workflow";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listWorkflows());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workflowName, description } = await req.json();
  if (!workflowName?.trim())
    return NextResponse.json({ error: "workflowName is required" }, { status: 400 });

  const [row] = await sql<{ workflowId: number }[]>`
    INSERT INTO bayanat.workflow_definitions (workflow_name, description)
    VALUES (${workflowName.trim()}, ${description?.trim() || null})
    RETURNING workflow_id AS "workflowId"
  `;
  return NextResponse.json({ ok: true, workflowId: row.workflowId });
}
