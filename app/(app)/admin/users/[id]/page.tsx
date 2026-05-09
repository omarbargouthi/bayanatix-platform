import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUserById, getAssignmentsForUser, listRoles } from "@/lib/queries/admin";
import { getSourcesWithSchemas } from "@/lib/queries/catalog";
import { getSchemaById } from "@/lib/queries/catalog";
import { UserDetailClient } from "./UserDetailClient";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const [user, assignments, roles, sourcesData] = await Promise.all([
    getUserById(params.id),
    getAssignmentsForUser(params.id),
    listRoles(),
    getSourcesWithSchemas(),
  ]);
  if (!user) notFound();

  const schemas = sourcesData.flatMap((s) => s.schemas);

  const entities = await sql<{ entity_id: number; entity_name_text: string }[]>`
    SELECT entity_id, entity_name_text FROM bayanat.data_entities ORDER BY entity_name_text
  `;

  const sources  = sourcesData.map((s) => ({ id: String(s.dataSourceId), name: s.sourceName }));
  const schemaList = schemas.map((s) => ({ id: String(s.schemaId), name: s.schemaName }));
  const tableList  = entities.map((e) => ({ id: String(e.entity_id), name: e.entity_name_text }));

  return (
    <UserDetailClient
      user={user}
      assignments={assignments}
      roles={roles}
      sources={sources}
      schemas={schemaList}
      tables={tableList}
    />
  );
}
