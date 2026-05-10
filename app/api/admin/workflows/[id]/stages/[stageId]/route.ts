import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string; stageId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stageName, description, assigneeRole, assigneeUserId, slaHours, isFinal, stageOrder } = await req.json();
  await sql`
    UPDATE bayanat.workflow_stages SET
      stage_name       = COALESCE(${stageName?.trim() ?? null}, stage_name),
      description      = COALESCE(${description?.trim() ?? null}, description),
      assignee_role    = COALESCE(${assigneeRole ?? null}, assignee_role),
      assignee_user_id = COALESCE(${assigneeUserId?.trim() ?? null}, assignee_user_id),
      sla_hours        = COALESCE(${slaHours ?? null}, sla_hours),
      is_final         = COALESCE(${isFinal ?? null}, is_final),
      stage_order      = COALESCE(${stageOrder ?? null}, stage_order)
    WHERE stage_id = ${Number(params.stageId)} AND workflow_id = ${Number(params.id)}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM bayanat.workflow_stages WHERE stage_id = ${Number(params.stageId)} AND workflow_id = ${Number(params.id)}`;
  return NextResponse.json({ ok: true });
}
