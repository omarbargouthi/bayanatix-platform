import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getDomains, getComplianceSummary } from "@/lib/queries/domains";
import {
  getComplianceSnapshot,
  getMaturityTrends,
  getRecentAssets,
  getRecentSearches,
} from "@/lib/queries/dashboard";
import { DashboardClient } from "./DashboardClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [domains, summary, snapshot, trends, recentAssets, recentSearches] = await Promise.all([
    getDomains(),
    getComplianceSummary(),
    getComplianceSnapshot(),
    getMaturityTrends(new Date().getFullYear()),
    getRecentAssets(user.userId, 10),
    getRecentSearches(user.userId, 5),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Dashboard" }]} user={user} />
      <DashboardClient
        firstName={firstName}
        domains={domains}
        summary={summary}
        snapshot={snapshot}
        trends={trends}
        recentAssets={recentAssets}
        recentSearches={recentSearches}
      />
    </>
  );
}
