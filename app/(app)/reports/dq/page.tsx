import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains, getDataSourcesLite, getUsersLite } from "@/lib/queries/reports";
import { DqReportClient } from "./DqReportClient";

export const dynamic = "force-dynamic";

export default async function DqReportPage() {
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
          { label: "Data Quality" },
        ]}
        user={user}
      />
      <DqReportClient domains={domains} sources={sources} owners={owners} isAdmin={user.role === "ADMIN"} />
    </>
  );
}
