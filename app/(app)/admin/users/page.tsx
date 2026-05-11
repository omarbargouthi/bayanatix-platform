import { redirect } from "next/navigation";
export default function UsersPage() {
  redirect("/admin/user-management?tab=users");
}
