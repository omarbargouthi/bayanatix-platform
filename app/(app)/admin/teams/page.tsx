import { redirect } from "next/navigation";
export default function TeamsPage() {
  redirect("/admin/user-management?tab=teams");
}
