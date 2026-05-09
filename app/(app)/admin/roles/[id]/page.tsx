import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRoleById, getAssignmentsForRole } from "@/lib/queries/admin";
import { RoleDetailClient } from "./RoleDetailClient";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/dashboard");

  const [role, assignments] = await Promise.all([
    getRoleById(Number(params.id)),
    getAssignmentsForRole(Number(params.id)),
  ]);
  if (!role) notFound();

  return <RoleDetailClient role={role} assignments={assignments} />;
}
