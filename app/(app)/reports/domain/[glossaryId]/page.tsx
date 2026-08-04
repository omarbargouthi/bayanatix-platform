import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getDomainScorecard } from "@/lib/queries/reports";
import { getRagStatus, RAG_CLASSES } from "@/lib/reports/rag";
import { TrendChart } from "@/components/reports/TrendChart";

export const dynamic = "force-dynamic";

function formatValue(value: number, format: "PERCENT" | "NUMBER" | "DAYS"): string {
  if (format === "PERCENT") return `${value}%`;
  if (format === "DAYS") return `${value}d`;
  return String(value);
}

export default async function DomainScorecardPage({ params }: { params: { glossaryId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const glossaryId = Number(params.glossaryId);
  const scorecard = await getDomainScorecard(glossaryId);
  if (!scorecard) notFound();

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Reports", href: "/reports" },
          { label: `${scorecard.domain.name} Scorecard` },
        ]}
        user={user}
      />
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-brand-deep">{scorecard.domain.name} — Domain Scorecard</h1>
            <p className="text-xs text-muted mt-0.5">Cross-capability status for the {scorecard.domain.name} business domain</p>
          </div>
          <a
            href={`/api/reports/domain/${glossaryId}/export-pdf`}
            className="text-sm px-3 py-2 rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/5"
          >
            Export PDF Brief
          </a>
        </div>

        <div className="card-padded">
          <div className="text-sm font-semibold text-ink mb-3">Capability Scores</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {scorecard.capabilities.map((c) => {
              const rag = getRagStatus(c.value, c.targetValue, c.direction);
              const classes = RAG_CLASSES[rag];
              return (
                <div key={c.reportCode} className={`card border-l-4 px-4 py-3 ${classes.border} ${classes.bg}`}>
                  <div className={`text-xl font-extrabold ${classes.text}`}>{formatValue(c.value, c.format)}</div>
                  <div className="text-[10px] text-muted mt-0.5 uppercase tracking-wider">{c.reportLabel}</div>
                  <div className="text-[10px] text-ink-soft mt-0.5">{c.kpiName}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card-padded">
            <div className="text-sm font-semibold text-ink mb-3">Top Issues</div>
            {scorecard.topIssues.length === 0 ? (
              <div className="text-sm text-muted text-center py-6">No open issues for this domain.</div>
            ) : (
              <ul className="space-y-2">
                {scorecard.topIssues.map((issue, i) => (
                  <li key={i}>
                    <a href={issue.href} className="text-sm text-brand-purple hover:underline font-medium">{issue.label}</a>
                    <div className="text-xs text-muted">{issue.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-padded">
            <div className="text-sm font-semibold text-ink mb-3">Owner &amp; Stewards</div>
            <div className="text-xs text-muted mb-2">Domain Owner: <span className="text-ink font-medium">{scorecard.ownerName ?? "Unassigned"}</span></div>
            {scorecard.stewards.length === 0 ? (
              <div className="text-sm text-muted text-center py-6">No stewards assigned to this domain yet.</div>
            ) : (
              <ul className="space-y-1.5">
                {scorecard.stewards.map((s) => (
                  <li key={s.userId} className="text-sm text-ink flex items-center justify-between">
                    <span>{s.fullName}</span>
                    <span className="text-xs text-muted">{s.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card-padded">
          <div className="text-sm font-semibold text-ink mb-2">DG Executive Summary Trend</div>
          <TrendChart
            data={scorecard.capabilities.find((c) => c.reportCode === "R8_DG_SUMMARY")?.trend ?? []}
            target={scorecard.capabilities.find((c) => c.reportCode === "R8_DG_SUMMARY")?.targetValue ?? null}
          />
        </div>
      </div>
    </>
  );
}
