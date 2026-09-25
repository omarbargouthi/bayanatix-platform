import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts } from "@/lib/queries/gov-framework";
import { FrameworkPageClient } from "./FrameworkPageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FrameworkPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const counts = await getSectionCounts();
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.governance.pageTitle, href: "/governance" },
          { label: t.governance.framework },
        ]}
        user={user}
      />
      <FrameworkPageClient counts={counts} />
    </>
  );
}
