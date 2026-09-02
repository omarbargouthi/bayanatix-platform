import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getUserById, getAssignmentsForUser, listRoles } from "@/lib/queries/admin";
import { getResourcePickerOptions } from "@/lib/queries/catalog";
import { UserDetailClient } from "./UserDetailClient";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const [user, assignments, roles, picker] = await Promise.all([
    getUserById(params.id),
    getAssignmentsForUser(params.id),
    listRoles(),
    getResourcePickerOptions(),
  ]);
  if (!user) notFound();

  return (
    <UserDetailClient
      user={user}
      assignments={assignments}
      roles={roles}
      sources={picker.sources}
      schemas={picker.schemas}
      tables={picker.tables}
    />
  );
}
