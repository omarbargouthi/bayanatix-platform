import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getDomains, getComplianceSummary } from "@/lib/queries/domains";
import {
  getComplianceSnapshot,
  getMaturityTrends,
  getRecentAssets,
  getRecentSearches,
} from "@/lib/queries/dashboard";
import { HalfDonut } from "@/components/ui/HalfDonut";
import { DomainCard } from "@/components/catalog/DomainCard";
import { MaturityChart } from "@/components/catalog/MaturityChart";
import { DashboardSearch } from "@/components/catalog/DashboardSearch";
import { Tag } from "@/components/ui/Tag";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [domains, summary, snapshot, trends, recentAssets, recentSearches] = await Promise.all([
    getDomains(),
    getComplianceSummary(),
    getComplianceSnapshot(),
    getMaturityTrends(2025),
    getRecentAssets(user.userId, 10),
    getRecentSearches(user.userId, 5),
  ]);

  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Dashboard" }]} user={user} />

      <main className="px-8 py-7 pb-14">
        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#f0f2ff] via-[#e7ecfb] to-[#e6e0f5] border border-line p-9 mb-6">
          <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full bg-brand-light/45 blur-2xl" />
          <div className="absolute -bottom-16 left-[10%] w-48 h-48 rounded-full bg-brand-purple/25 blur-2xl" />

          <div className="relative">
            <h1 className="text-2xl font-bold text-brand-deep mb-4">Welcome, {firstName}!</h1>
            <DashboardSearch recentAssets={recentAssets} recentSearches={recentSearches} />
          </div>
        </section>

        {/* Metric cards */}
        <section className="grid grid-cols-2 gap-5 mb-6">
          {/* Overall Compliance — half donut */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Overall Compliance</h3>
              {snapshot && <Tag variant="purple">{snapshot.periodLabel}</Tag>}
            </div>
            <div className="flex items-center gap-5">
              <div className="shrink-0">
                <HalfDonut
                  value={snapshot?.current ?? summary.overallPct}
                  previousValue={snapshot?.previous}
                  prevLabel={snapshot?.prevLabel ?? "last period"}
                  size={195}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 flex-1">
                <Stat label="Specs tracked"    value={summary.specsTracked} />
                <Stat label="Domains active"   value={`${summary.domainsActive} / 14`} />
                <Stat label="Controls passing" value={summary.controlsPassing} />
                <Stat label="Open findings"    value={summary.openFindings} />
              </div>
            </div>
          </div>

          {/* Overall Maturity — NDI / NAII trend */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Overall Maturity</h3>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-purple inline-block" /> NDI
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-light inline-block" /> NAII
                </span>
              </div>
            </div>
            <MaturityChart data={trends} />
          </div>
        </section>

        {/* Domain grid */}
        <section>
          <h2 className="text-xl font-bold mb-4">NDMO Domains</h2>
          <div className="grid grid-cols-3 gap-5">
            {domains.map((d) => (
              <DomainCard key={d.domainCode} d={d} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}
