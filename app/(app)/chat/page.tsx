import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { ChatPageClient } from "./ChatPageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = getServerT();

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: t.chat.headerTitle }]} user={user} />
      <ChatPageClient />
    </>
  );
}
