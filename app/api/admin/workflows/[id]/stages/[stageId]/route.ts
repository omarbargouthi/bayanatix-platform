import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string; stageId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stageName, description, assigneeType, assigneeRoleId, assigneeTeamId, assigneeUserId, slaHours, isFinal, stageOrder } = await req.json();

  // Assignee is an all-or-nothing triple (role/team/user), not something
  // COALESCE can merge field-by-field — when the type changes, the other two
  // must be cleared, not left pointing at the previous type's target.
  if (assigneeType !== undefined) {
    const VALID_TYPES = ["ROLE", "TEAM", "USER", "REQUESTER"];
    if (!VALID_TYPES.includes(assigneeType))
      return NextResponse.json({ error: "Invalid assigneeType" }, { status: 400 });
    if (assigneeType === "ROLE" && !assigneeRoleId)
      return NextResponse.json({ error: "assigneeRoleId required for ROLE" }, { status: 400 });
    if (assigneeType === "TEAM" && !assigneeTeamId)
      return NextResponse.json({ error: "assigneeTeamId required for TEAM" }, { status: 400 });
    if (assigneeType === "USER" && !assigneeUserId?.trim())
      return NextResponse.json({ error: "assigneeUserId required for USER" }, { status: 400 });

    await sql`
      UPDATE bayanat.workflow_stages SET
        assignee_type     = ${assigneeType},
        assignee_role_id  = ${assigneeType === "ROLE" ? assigneeRoleId : null},
        assignee_team_id  = ${assigneeType === "TEAM" ? assigneeTeamId : null},
        assignee_user_id  = ${assigneeType === "USER" ? assigneeUserId.trim() : null}
      WHERE stage_id = ${Number(params.stageId)} AND workflow_id = ${Number(params.id)}
    `;
  }

  await sql`
    UPDATE bayanat.workflow_stages SET
      stage_name_text  = COALESCE(${stageName?.trim() ?? null}, stage_name_text),
      description_text = COALESCE(${description?.trim() ?? null}, description_text),
      sla_days_count    = COALESCE(${slaHours ?? null}, sla_days_count),
      is_final          = COALESCE(${isFinal ?? null}, is_final),
      stage_order       = COALESCE(${stageOrder ?? null}, stage_order)
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
