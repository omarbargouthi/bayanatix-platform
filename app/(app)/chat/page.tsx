import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { ChatPageClient } from "./ChatPageClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Ask Bayanatix" }]} user={user} />
      <ChatPageClient />
    </>
  );
}
