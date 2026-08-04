import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains, getDataSourcesLite, getUsersLite } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";
import { DqReportClient } from "./DqReportClient";

export const dynamic = "force-dynamic";

export default async function DqReportPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [allDomains, sources, owners, scope] = await Promise.all([
    getBusinessDomains(),
    getDataSourcesLite(),
    getUsersLite(),
    getStewardScopeInfo(user),
  ]);
  const domains = scope.restricted ? allDomains.filter((d) => scope.allowedDomainIds.includes(d.glossaryId)) : allDomains;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: "Data Quality" },
        ]}
        user={user}
      />
      <DqReportClient domains={domains} sources={sources} owners={owners} isAdmin={user.role === "ADMIN"} domainLocked={scope.restricted} />
    </>
  );
}
