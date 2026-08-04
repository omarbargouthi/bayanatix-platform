import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";
import { ReportsIndexClient } from "./ReportsIndexClient";

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [allDomains, scope] = await Promise.all([getBusinessDomains(), getStewardScopeInfo(user)]);
  const domains = scope.restricted ? allDomains.filter((d) => scope.allowedDomainIds.includes(d.glossaryId)) : allDomains;

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Reports" }]} user={user} />
      <ReportsIndexClient domains={domains} />
    </>
  );
}
