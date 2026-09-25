import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getDqDimensions, getDqRules, getDqDashboardStats, getDqTrendData, getRecentDqResults } from "@/lib/queries/dq";
import { DqAdminClient } from "@/app/(app)/admin/data-quality/DqAdminClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [dimensions, rules, stats, trend, recentRuns] = await Promise.all([
    getDqDimensions(),
    getDqRules(),
    getDqDashboardStats(),
    getDqTrendData(14),
    getRecentDqResults(20),
  ]);

  const canEdit = user.role === "ADMIN" || user.role === "STEWARD";
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: t.nav.quality },
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
