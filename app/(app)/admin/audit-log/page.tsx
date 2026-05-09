import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUsers } from "@/lib/queries/admin";
import { AuditLogClient } from "./AuditLogClient";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  const users = await listUsers();
  return <AuditLogClient users={users} />;
}
