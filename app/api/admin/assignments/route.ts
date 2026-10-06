import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAssignment, createDomainAssignments, deleteAssignment, getRoleById, getUserById, viewerMembersOfTeam } from "@/lib/queries/admin";
import { hasCatalogPrivileges, isReadOnlyRole } from "@/lib/domain-roles";

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { roleId, userId, teamId, resourceType, resourceId, resourceName } = body;
  if (!roleId || (!userId && !teamId))
    return NextResponse.json({ error: "roleId and userId or teamId required" }, { status: 400 });

  const role = await getRoleById(Number(roleId));
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const readOnly = isReadOnlyRole(role);

  // A user whose system role is Viewer can only hold read-only roles: the administrator
  // changes the system role first, then assigns a role that can change or manage things.
  if (userId && !readOnly) {
    const target = await getUserById(String(userId));
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.systemRole === "VIEWER") {
      return NextResponse.json({
        code: "VIEWER_SYSTEM_ROLE",
        error: "This user's system role is Viewer, which is read-only. Change the system role (Profile › System Role) before assigning a role that can edit or manage.",
      }, { status: 409 });
    }
  }

  // The same rule for a team: its roles reach every member, so a role beyond read-only
  // can't be given to a team that has Viewer members.
  if (teamId && !readOnly) {
    const viewers = await viewerMembersOfTeam(Number(teamId));
    if (viewers.length > 0) {
      return NextResponse.json({
        code: "VIEWER_SYSTEM_ROLE",
        error: `This team has members whose system role is Viewer, which is read-only: ${viewers.join(", ")}. Change their system role or remove them from the team before assigning a role that can edit or manage.`,
      }, { status: 409 });
    }
  }

  // A domain role applies to its domain(s), never to a data source / schema / table:
  // it is saved against the domain. Only when the role also carries catalog privileges
  // (metadata / data) does the scope that was sent apply — to that part of the role.
  const roleDomains = role.domainCodes?.length ? role.domainCodes : null;
  if (roleDomains) {
    const wanted = Array.isArray(body.domains) ? roleDomains.filter((d) => body.domains.includes(d)) : roleDomains;
    if (wanted.length === 0) return NextResponse.json({ error: "Select at least one domain" }, { status: 400 });
    const ids = await createDomainAssignments({ roleId: Number(roleId), userId: userId ?? undefined, teamId: teamId ?? undefined, domains: wanted });
    if (!hasCatalogPrivileges(role)) return NextResponse.json({ assignmentId: ids[0], assignmentIds: ids }, { status: 201 });
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
