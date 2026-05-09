import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAssignment, deleteAssignment } from "@/lib/queries/admin";

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { roleId, userId, teamId, resourceType, resourceId, resourceName } = body;
  if (!roleId || (!userId && !teamId))
    return NextResponse.json({ error: "roleId and userId or teamId required" }, { status: 400 });

  const assignmentId = await createAssignment({
    roleId,
    userId: userId ?? undefined,
    teamId: teamId ?? undefined,
    resourceType: resourceType ?? "GLOBAL",
    resourceId:   resourceId ?? null,
    resourceName: resourceName ?? "Global",
  });
  return NextResponse.json({ assignmentId }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assignmentId } = await req.json();
  await deleteAssignment(Number(assignmentId));
  return NextResponse.json({ ok: true });
}
