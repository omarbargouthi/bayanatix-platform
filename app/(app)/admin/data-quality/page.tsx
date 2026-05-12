import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getDqDimensions, getDqRules, getDqDashboardStats, getDqTrendData, getRecentDqResults } from "@/lib/queries/dq";
import { DqAdminClient } from "./DqAdminClient";

export const dynamic = "force-dynamic";

export default async function DataQualityAdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STEWARD") redirect("/dashboard");

  const [dimensions, rules, stats, trend, recentRuns] = await Promise.all([
    getDqDimensions(),
    getDqRules(),
    getDqDashboardStats(),
    getDqTrendData(14),
    getRecentDqResults(20),
  ]);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Administration" },
          { label: "Data Quality" },
        ]}
        user={user}
      />
      <DqAdminClient
        dimensions={dimensions}
        initialRules={rules}
        stats={stats}
        trend={trend}
        recentRuns={recentRuns}
        userRole={user.role}
      />
    </>
  );
}
