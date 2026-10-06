import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAssignment, createDomainAssignments, roleDomainCodes, deleteAssignment } from "@/lib/queries/admin";

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { roleId, userId, teamId, resourceType, resourceId, resourceName } = body;
  if (!roleId || (!userId && !teamId))
    return NextResponse.json({ error: "roleId and userId or teamId required" }, { status: 400 });

  // A domain role applies to its domain(s), never to a data source / schema / table:
  // whatever scope was sent is ignored and it is saved against the domain.
  const roleDomains = await roleDomainCodes(Number(roleId));
  if (roleDomains) {
    const wanted = Array.isArray(body.domains) ? roleDomains.filter((d) => body.domains.includes(d)) : roleDomains;
    if (wanted.length === 0) return NextResponse.json({ error: "Select at least one domain" }, { status: 400 });
    const ids = await createDomainAssignments({ roleId: Number(roleId), userId: userId ?? undefined, teamId: teamId ?? undefined, domains: wanted });
    return NextResponse.json({ assignmentId: ids[0], assignmentIds: ids }, { status: 201 });
  }

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
