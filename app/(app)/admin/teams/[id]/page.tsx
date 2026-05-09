import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTeamById, getTeamMembers, getAssignmentsForTeam, listRoles, listUsers } from "@/lib/queries/admin";
import { getSourcesWithSchemas } from "@/lib/queries/catalog";
import { TeamDetailClient } from "./TeamDetailClient";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const teamId = Number(params.id);
  const [team, members, assignments, roles, allUsers, sourcesData] = await Promise.all([
    getTeamById(teamId),
    getTeamMembers(teamId),
    getAssignmentsForTeam(teamId),
    listRoles(),
    listUsers(),
    getSourcesWithSchemas(),
  ]);
  if (!team) notFound();

  const schemas = sourcesData.flatMap((s) => s.schemas);
  const entities = await sql<{ entity_id: number; entity_name_text: string }[]>`
    SELECT entity_id, entity_name_text FROM bayanat.data_entities ORDER BY entity_name_text
  `;

  const sources    = sourcesData.map((s) => ({ id: String(s.dataSourceId), name: s.sourceName }));
  const schemaList = schemas.map((s) => ({ id: String(s.schemaId), name: s.schemaName }));
  const tableList  = entities.map((e) => ({ id: String(e.entity_id), name: e.entity_name_text }));
  const memberIds  = new Set(members.map((m) => m.userId));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.userId));

  return (
    <TeamDetailClient
      team={team}
      members={members}
      assignments={assignments}
      roles={roles}
      nonMembers={nonMembers}
      sources={sources}
      schemas={schemaList}
      tables={tableList}
    />
  );
}
