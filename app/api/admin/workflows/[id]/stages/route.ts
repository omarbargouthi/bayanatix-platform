import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stageName, description, assigneeType, assigneeRoleId, assigneeTeamId, assigneeUserId, slaHours, isFinal } = await req.json();
  if (!stageName?.trim()) return NextResponse.json({ error: "stageName required" }, { status: 400 });

  const VALID_TYPES = ["ROLE", "TEAM", "USER", "REQUESTER"];
  if (!VALID_TYPES.includes(assigneeType))
    return NextResponse.json({ error: "Invalid assigneeType" }, { status: 400 });
  if (assigneeType === "ROLE" && !assigneeRoleId)
    return NextResponse.json({ error: "assigneeRoleId required for ROLE" }, { status: 400 });
  if (assigneeType === "TEAM" && !assigneeTeamId)
    return NextResponse.json({ error: "assigneeTeamId required for TEAM" }, { status: 400 });
  if (assigneeType === "USER" && !assigneeUserId?.trim())
    return NextResponse.json({ error: "assigneeUserId required for USER" }, { status: 400 });

  const [maxOrder] = await sql<{ max: number | null }[]>`
    SELECT max(stage_order) AS max FROM bayanat.workflow_stages WHERE workflow_id = ${Number(params.id)}
  `;
  const nextOrder = (maxOrder?.max ?? 0) + 1;

  const [row] = await sql<{ stageId: number }[]>`
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text,
       assignee_type, assignee_role_id, assignee_team_id, assignee_user_id, sla_days_count, is_final)
    VALUES (${Number(params.id)}, ${nextOrder}, ${stageName.trim()},
            ${description?.trim() || null}, ${assigneeType},
            ${assigneeType === "ROLE" ? assigneeRoleId : null},
            ${assigneeType === "TEAM" ? assigneeTeamId : null},
            ${assigneeType === "USER" ? assigneeUserId.trim() : null},
            ${slaHours ?? null}, ${isFinal ?? false})
    RETURNING stage_id AS "stageId"
  `;
  return NextResponse.json({ ok: true, stageId: row.stageId });
}
