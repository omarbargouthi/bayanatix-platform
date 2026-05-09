import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getThreadById } from "@/lib/queries/collaboration";
import { ThreadDetailClient } from "./ThreadDetailClient";

export const dynamic = "force-dynamic";

export default async function ThreadDetailPage({ params }: { params: { threadId: string } }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getThreadById(Number(params.threadId));
  if (!data) notFound();

  return <ThreadDetailClient thread={data.thread} messages={data.messages} />;
}
