import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listUsers } from "@/lib/queries/admin";
import { UsersPageClient } from "./UsersPageClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  const users = await listUsers();
  return <UsersPageClient users={users} />;
}
