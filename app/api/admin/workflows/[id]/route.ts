import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workflowName, description, statusCode } = await req.json();
  if (statusCode && !["Draft", "Active", "Deactive"].includes(statusCode)) {
    return NextResponse.json({ error: "Invalid statusCode" }, { status: 400 });
  }

  if (statusCode === "Draft") {
    const [assigned] = await sql<{ cnt: number }[]>`
      SELECT count(*)::int AS cnt FROM bayanat.request_type_workflows WHERE workflow_id = ${Number(params.id)}
    `;
    if (assigned.cnt > 0) {
      return NextResponse.json({ error: "Cannot set to Draft while assigned to request types — unassign first" }, { status: 400 });
    }
  }

  await sql`
    UPDATE bayanat.workflow_definitions SET
      workflow_name_text = COALESCE(${workflowName?.trim() ?? null}, workflow_name_text),
      description_text   = COALESCE(${description?.trim() ?? null}, description_text),
      status_code         = COALESCE(${statusCode ?? null}, status_code)
    WHERE workflow_id = ${Number(params.id)}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workflowId = Number(params.id);

  // Same restriction as the per-stage DELETE (see stages/[stageId]/route.ts):
  // workflow_instances.workflow_id and workflow_stage_history.stage_id both
  // have no ON DELETE CASCADE, so a workflow any request has ever run
  // through can't be silently removed. Check first for a real error instead
  // of an opaque FK-violation 500.
  const [used] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt FROM bayanat.workflow_instances WHERE workflow_id = ${workflowId}
  `;
  if (used.cnt > 0) {
    return NextResponse.json(
      { error: "Cannot delete this workflow — requests have already run through it. Set it to Deactive instead." },
      { status: 400 },
    );
  }

  await sql`DELETE FROM bayanat.workflow_definitions WHERE workflow_id = ${workflowId}`;
  return NextResponse.json({ ok: true });
}
