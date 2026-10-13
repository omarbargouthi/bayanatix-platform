import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { getSectionCounts, getHiddenSections } from "@/lib/queries/gov-framework";
import { listCommEvents } from "@/lib/queries/gov-comm-events";
import { FrameworkPageClient } from "./FrameworkPageClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FrameworkPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [counts, hiddenSections, canManage, events, t] = await Promise.all([
    getSectionCounts(), getHiddenSections(), canManageDomain(user, "GOVERNANCE"), listCommEvents(), getServerT(user),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = events.filter((e) => e.statusCode === "PLANNED" && (e.endDate ?? e.eventDate) >= today).length;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.governance.pageTitle, href: "/governance" },
          { label: t.governance.framework },
        ]}
        user={user}
      />
      <FrameworkPageClient counts={counts} hiddenSections={hiddenSections} canManage={canManage} upcomingEvents={upcomingEvents} />
    </>
  );
}
