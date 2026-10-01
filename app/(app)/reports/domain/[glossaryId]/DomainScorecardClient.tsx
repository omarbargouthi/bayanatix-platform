"use client";

import { useState } from "react";
import type { DomainScorecard } from "@/lib/queries/reports";
import { getRagStatus, RAG_CLASSES } from "@/lib/reports/rag";
import { TrendChart } from "@/components/reports/TrendChart";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import { usePollBackgroundJob } from "@/components/shared/BackgroundJobsPanel";

function formatValue(value: number, format: "PERCENT" | "NUMBER" | "DAYS"): string {
  if (format === "PERCENT") return `${value}%`;
  if (format === "DAYS") return `${value}d`;
  return String(value);
}

function capabilityLabel(t: I18nStrings, reportCode: string): string {
  const map: Record<string, string> = {
    R1_MCM: t.reports.mcm.title,
    R2_DQ: t.reports.dq.title,
    R3_DC: t.reports.dc.title,
    R4_DSI: t.reports.dsi.title,
    R5_OD: t.reports.od.title,
    R6_FOI: t.reports.foi.title,
    R7_PDP: t.reports.pdp.title,
    R8_DG_SUMMARY: t.reports.dg.title,
    R9_RETENTION: t.reports.retention.title,
  };
  return map[reportCode] ?? reportCode;
}

export function DomainScorecardClient({ scorecard, glossaryId }: { scorecard: DomainScorecard; glossaryId: number }) {
  const { t, lang } = useLang();
  const rd = t.reports.domain;
  const [latestJobId, setLatestJobId] = useState<number | null>(null);
  const [triggering, setTriggering] = useState(false);
  const latestJob = usePollBackgroundJob(latestJobId);

  async function exportPdf() {
    setTriggering(true);
    try {
      const res = await fetch(`/api/reports/domain/${glossaryId}/export-pdf`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }),
      });
      const data = await res.json();
      if (res.ok) setLatestJobId(data.jobId);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-deep flex items-center gap-2">
            {scorecard.domain.name}
            {scorecard.linkedCustomAssetCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700" title="Custom assets (e.g. customers, roles) linked to tables/columns in this domain">
                🧩 {scorecard.linkedCustomAssetCount} linked custom asset{scorecard.linkedCustomAssetCount !== 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-xs text-muted mt-0.5">{t.reports.index.scorecardsSubtitle}</p>
        </div>
        <button
          onClick={exportPdf}
          disabled={triggering}
          className="text-sm px-3 py-2 rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/5 disabled:opacity-60"
        >
          {triggering ? "Starting…" : rd.exportBrief}
        </button>
      </div>

      {latestJob && latestJob.status !== "COMPLETED" && latestJob.status !== "FAILED" && (
        <div className="text-xs text-muted">Export started — track progress and download from Notifications &rarr; Jobs.</div>
      )}
      {latestJob?.status === "COMPLETED" && (
        <div className="text-xs text-emerald-700">✓ Export ready — download it from Notifications &rarr; Jobs.</div>
      )}
      {latestJob?.status === "FAILED" && (
        <div className="text-xs text-red-600">Export failed{latestJob.errorText ? `: ${latestJob.errorText}` : "."} See Notifications &rarr; Jobs for details.</div>
      )}

      <div className="card-padded">
        <div className="text-sm font-semibold text-ink mb-3">{rd.capabilityScores}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {scorecard.capabilities.map((c) => {
            const rag = getRagStatus(c.value, c.targetValue, c.direction);
            const classes = RAG_CLASSES[rag];
            return (
              <div key={c.reportCode} className={`card border-l-4 px-4 py-3 ${classes.border} ${classes.bg}`}>
                <div className={`text-xl font-extrabold ${classes.text}`}>{formatValue(c.value, c.format)}</div>
                <div className="text-[10px] text-muted mt-0.5 uppercase tracking-wider">{capabilityLabel(t, c.reportCode)}</div>
                <div className="text-[10px] text-ink-soft mt-0.5">{pickTranslation(c.kpiName, c.kpiNameTranslations, lang)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-padded">
          <div className="text-sm font-semibold text-ink mb-3">{rd.topIssues}</div>
          {scorecard.topIssues.length === 0 ? (
            <div className="text-sm text-muted text-center py-6">{rd.noIssues}</div>
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
          <div className="text-sm font-semibold text-ink mb-3">{rd.ownerStewards}</div>
          <div className="text-xs text-muted mb-2">{rd.domainOwner}: <span className="text-ink font-medium">{scorecard.ownerName ?? rd.unassigned}</span></div>
          {scorecard.stewards.length === 0 ? (
            <div className="text-sm text-muted text-center py-6">{rd.noStewards}</div>
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
        {(() => {
          const cap = scorecard.capabilities.find((c) => c.reportCode === "R8_DG_SUMMARY");
          return (
            <TrendChart
              data={cap?.trend ?? []}
              kpi={cap ? { nameEn: cap.kpiName, nameTranslations: cap.kpiNameTranslations, targetValue: cap.targetValue, format: cap.format } : null}
            />
          );
        })()}
      </div>
    </div>
  );
}
