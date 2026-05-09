import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listTags } from "@/lib/queries/catalog";
import { TagsClient } from "./TagsClient";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");
  const tags = await listTags();
  return <TagsClient tags={tags} />;
}
