import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTeamById, getTeamMembers, getAssignmentsForTeam, listRoles, listUsers } from "@/lib/queries/admin";
import { getResourcePickerOptions } from "@/lib/queries/catalog";
import { TeamDetailClient } from "./TeamDetailClient";

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const teamId = Number(params.id);
  const [team, members, assignments, roles, allUsers, picker] = await Promise.all([
    getTeamById(teamId),
    getTeamMembers(teamId),
    getAssignmentsForTeam(teamId),
    listRoles(),
    listUsers(),
    getResourcePickerOptions(),
  ]);
  if (!team) notFound();

  const memberIds  = new Set(members.map((m) => m.userId));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.userId));

  return (
    <TeamDetailClient
      team={team}
      members={members}
      assignments={assignments}
      roles={roles}
      nonMembers={nonMembers}
      sources={picker.sources}
      schemas={picker.schemas}
      tables={picker.tables}
    />
  );
}
