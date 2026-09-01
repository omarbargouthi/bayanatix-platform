import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stageName, description, assigneeRole, assigneeUserId, slaHours, isFinal } = await req.json();
  if (!stageName?.trim()) return NextResponse.json({ error: "stageName required" }, { status: 400 });

  const VALID_ROLES = ["STEWARD","OWNER","OFFICER","ADMIN","REQUESTER","SPECIFIC_USER"];
  if (!VALID_ROLES.includes(assigneeRole))
    return NextResponse.json({ error: "Invalid assigneeRole" }, { status: 400 });

  const [maxOrder] = await sql<{ max: number | null }[]>`
    SELECT max(stage_order) AS max FROM bayanat.workflow_stages WHERE workflow_id = ${Number(params.id)}
  `;
  const nextOrder = (maxOrder?.max ?? 0) + 1;

  const [row] = await sql<{ stageId: number }[]>`
    INSERT INTO bayanat.workflow_stages
      (workflow_id, stage_order, stage_name_text, description_text, required_role_code, assignee_user_id, sla_days_count, is_final)
    VALUES (${Number(params.id)}, ${nextOrder}, ${stageName.trim()},
            ${description?.trim() || null}, ${assigneeRole},
            ${assigneeUserId?.trim() || null}, ${slaHours ?? null}, ${isFinal ?? false})
    RETURNING stage_id AS "stageId"
  `;
  return NextResponse.json({ ok: true, stageId: row.stageId });
}
