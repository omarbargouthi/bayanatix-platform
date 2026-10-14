import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getServerT } from "@/lib/i18n/server";
import { HelpCenterClient } from "@/components/help/HelpCenterClient";

export const dynamic = "force-dynamic";

// The Help Center: every feature's documentation, open to every signed-in user.
export default async function HelpPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const t = await getServerT(user);

  return (
    <>
      <Header crumbs={[{ label: "Bayanis", href: "/dashboard" }, { label: t.help.title }]} user={user} />
      <HelpCenterClient isAdmin={user.role === "ADMIN"} />
    </>
  );
}
