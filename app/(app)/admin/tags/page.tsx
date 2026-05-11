import { redirect } from "next/navigation";
export default function TagsPage() {
  redirect("/admin/user-management?tab=tags");
}
