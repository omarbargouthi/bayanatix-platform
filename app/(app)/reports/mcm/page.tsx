import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains, getDataSourcesLite, getUsersLite } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";
import { McmReportClient } from "./McmReportClient";

export const dynamic = "force-dynamic";

export default async function McmReportPage() {
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
          { label: "Data Catalog / Metadata" },
        ]}
        user={user}
      />
      <McmReportClient domains={domains} sources={sources} owners={owners} isAdmin={user.role === "ADMIN"} domainLocked={scope.restricted} />
    </>
  );
}
