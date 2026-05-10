import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { workflowName, description, isActive } = await req.json();
  await sql`
    UPDATE bayanat.workflow_definitions SET
      workflow_name = COALESCE(${workflowName?.trim() ?? null}, workflow_name),
      description   = COALESCE(${description?.trim() ?? null}, description),
      is_active     = COALESCE(${isActive ?? null}, is_active)
    WHERE workflow_id = ${Number(params.id)}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await sql`DELETE FROM bayanat.workflow_definitions WHERE workflow_id = ${Number(params.id)}`;
  return NextResponse.json({ ok: true });
}
