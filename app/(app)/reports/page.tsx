import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";
import { ReportsIndexClient } from "./ReportsIndexClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [allDomains, scope] = await Promise.all([getBusinessDomains(), getStewardScopeInfo(user)]);
  const domains = scope.restricted ? allDomains.filter((d) => scope.allowedDomainIds.includes(d.glossaryId)) : allDomains;
  const t = getServerT();

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: t.nav.reports }]} user={user} />
      <ReportsIndexClient domains={domains} />
    </>
  );
}
