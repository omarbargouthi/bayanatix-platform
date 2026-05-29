"use client";

import { useLang } from "@/lib/lang-context";
import { HalfDonut } from "@/components/ui/HalfDonut";
import { DomainCard } from "@/components/catalog/DomainCard";
import { MaturityChart } from "@/components/catalog/MaturityChart";
import { DashboardSearch } from "@/components/catalog/DashboardSearch";
import { Tag } from "@/components/ui/Tag";
import type {
  GovernanceDomain, ComplianceSummary, ComplianceSnapshot,
  TrendPoint, RecentAsset,
} from "@/lib/types";

type Props = {
  firstName:      string;
  domains:        GovernanceDomain[];
  summary:        ComplianceSummary;
  snapshot:       ComplianceSnapshot | null;
  trends:         TrendPoint[];
  recentAssets:   RecentAsset[];
  recentSearches: string[];
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

export function DashboardClient({
  firstName, domains, summary, snapshot, trends, recentAssets, recentSearches,
}: Props) {
  const { t } = useLang();

  return (
    <main className="px-8 py-7 pb-14">

      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#f0f2ff] via-[#e7ecfb] to-[#e6e0f5] border border-line p-9 mb-6">
        <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full bg-brand-light/45 blur-2xl" />
        <div className="absolute -bottom-16 left-[10%] w-48 h-48 rounded-full bg-brand-purple/25 blur-2xl" />
        <div className="relative">
          <h1 className="text-2xl font-bold text-brand-deep mb-4">
            {t.dashboard.welcome.replace("{name}", firstName)}
          </h1>
          <DashboardSearch recentAssets={recentAssets} recentSearches={recentSearches} />
        </div>
      </section>

      {/* Metric cards */}
      <section className="grid grid-cols-2 gap-5 mb-6">

        {/* Overall Compliance */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold">{t.dashboard.overallCompliance}</h3>
            {snapshot && <Tag variant="purple">{snapshot.periodLabel}</Tag>}
          </div>
          <div className="flex items-center gap-5">
            <div className="shrink-0">
              <HalfDonut
                value={snapshot?.current ?? summary.overallPct}
                previousValue={snapshot?.previous}
                prevLabel={snapshot?.prevLabel ?? t.dashboard.lastPeriod}
                size={195}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 flex-1">
              <Stat label={t.dashboard.stats.specsTracked}    value={summary.specsTracked} />
              <Stat label={t.dashboard.stats.domainsActive}   value={`${summary.domainsActive} / 14`} />
              <Stat label={t.dashboard.stats.controlsPassing} value={summary.controlsPassing} />
              <Stat label={t.dashboard.stats.openFindings}    value={summary.openFindings} />
            </div>
          </div>
        </div>

        {/* Overall Maturity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold">{t.dashboard.overallMaturity}</h3>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-purple inline-block" /> NDI
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-light inline-block" /> NAII
              </span>
            </div>
          </div>
          <MaturityChart data={trends} noDataLabel={t.dashboard.noTrendData} />
        </div>
      </section>

      {/* Domain grid */}
      <section>
        <h2 className="text-xl font-bold mb-4">{t.dashboard.ndomoDomains}</h2>
        <div className="grid grid-cols-3 gap-5">
          {domains.map((d) => (
            <DomainCard
              key={d.domainCode}
              d={d}
              labels={{
                compliance: t.dashboard.domainCard.compliance,
                maturity:   t.dashboard.domainCard.maturity,
              }}
            />
          ))}
        </div>
      </section>

    </main>
  );
}
