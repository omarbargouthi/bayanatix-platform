import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains, getDataSourcesLite, getUsersLite } from "@/lib/queries/reports";
import { DgSummaryReportClient } from "./DgSummaryReportClient";

export const dynamic = "force-dynamic";

export default async function DgSummaryReportPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [domains, sources, owners] = await Promise.all([
    getBusinessDomains(),
    getDataSourcesLite(),
    getUsersLite(),
  ]);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: "DG Executive Summary" },
        ]}
        user={user}
      />
      <DgSummaryReportClient domains={domains} sources={sources} owners={owners} isAdmin={user.role === "ADMIN"} />
    </>
  );
}
