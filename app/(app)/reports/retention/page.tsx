import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains, getDataSourcesLite, getUsersLite } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";
import { RetentionReportClient } from "./RetentionReportClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function RetentionReportPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [allDomains, sources, owners, scope] = await Promise.all([
    getBusinessDomains(),
    getDataSourcesLite(),
    getUsersLite(),
    getStewardScopeInfo(user),
  ]);
  const domains = scope.restricted ? allDomains.filter((d) => scope.allowedDomainIds.includes(d.glossaryId)) : allDomains;
  const t = getServerT();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.reports, href: "/reports" },
          { label: t.reports.retention.title },
        ]}
        user={user}
      />
      <RetentionReportClient domains={domains} sources={sources} owners={owners} isAdmin={user.role === "ADMIN"} domainLocked={scope.restricted} />
    </>
  );
}
