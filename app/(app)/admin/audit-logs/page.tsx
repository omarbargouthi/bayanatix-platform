"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuditLogClient } from "@/app/(app)/admin/audit-log/AuditLogClient";
import type { AdminUser } from "@/lib/types";
import { BackgroundJobsPanel } from "@/components/shared/BackgroundJobsPanel";
import { useLang } from "@/lib/lang-context";
import { DataAccessLogSection } from "@/components/admin/DataAccessLogSection";

// Every job_type_code any feature creates via lib/queries/background-jobs.ts's
// createJob() — kept here (not imported from that file) since this is a client
// component and that file pulls in the server-only postgres.js driver.
const BACKGROUND_JOB_TYPES = [
  "GOV_COMPLIANCE_EXPORT", "GOV_COMPLIANCE_IMPORT",
  "REPORT_EXPORT_XLSX", "REPORT_EXPORT_PDF",
  "TRANSLATIONS_EXPORT", "TRANSLATIONS_IMPORT",
  "LINEAGE_IMPORT", "LINEAGE_PROPAGATION",
];
// ── Audit log section ─────────────────────────────────────────────────────────

function AuditSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => { fetch("/api/admin/users").then(r => r.json()).then(setUsers); }, []);
  return <AuditLogClient users={users} />;
}

// ── Job logs section ──────────────────────────────────────────────────────────

type CrawlJob = {
  jobId: number; connectionId: number | null; connectionName: string;
  startedAt: string; finishedAt: string | null; status: string;
  schemaCount: number; tableCount: number; columnCount: number; errorText: string | null;
};

type CrawlJobLog = { logId: number; loggedAt: string; level: string; message: string };

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  FAILED:    "bg-red-100 text-red-800",
  RUNNING:   "bg-yellow-100 text-yellow-800 animate-pulse",
};

function JobLogsSection() {
  const { t } = useLang();
  const j = t.jobLogs;
  const statusLabel: Record<string, string> = { COMPLETED: j.statusCompleted, FAILED: j.statusFailed, RUNNING: j.statusRunning };
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [logs, setLogs] = useState<Map<number, CrawlJobLog[]>>(new Map());
  const [logsLoading, setLogsLoading] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/crawl-jobs").then(r => r.json()).then(j => { setJobs(j); setLoading(false); });
  }, []);

  async function toggleLogs(jobId: number) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    if (!logs.has(jobId)) {
      setLogsLoading(jobId);
      const r = await fetch(`/api/admin/crawl-jobs/${jobId}/logs`);
      const data: CrawlJobLog[] = await r.json();
      setLogs(prev => new Map(prev).set(jobId, data));
      setLogsLoading(null);
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  const dur = (a: string, b: string | null) => {
    if (!b) return "—";
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return ms < 60000 ? `${Math.round(ms/1000)}s` : `${Math.round(ms/60000)}m`;
  };

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-bold text-ink">{j.crawlHistory}</h2>
        <button onClick={() => { setLoading(true); fetch("/api/admin/crawl-jobs").then(r=>r.json()).then(j=>{setJobs(j);setLoading(false);}); }}
          className="btn btn-sm text-xs">{j.refresh}</button>
      </div>

      {loading && <div className="py-16 text-center text-muted">{t.common.loading}</div>}

      {!loading && jobs.length === 0 && (
        <div className="py-16 text-center text-muted text-sm">{j.noCrawlJobs}</div>
      )}

      {!loading && jobs.map(job => (
        <div key={job.jobId} className="card mb-3 overflow-hidden">
          <button
            className="w-full grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-4 items-center text-start hover:bg-canvas-soft transition-colors"
            onClick={() => toggleLogs(job.jobId)}
          >
            <div>
              <div className="text-sm font-semibold text-brand-deep">{job.connectionName}</div>
              <div className="text-[11px] text-muted mt-0.5">{j.jobNumber.replace("{id}", String(job.jobId))}</div>
            </div>
            <div>
              <div className="text-xs text-ink">{fmt(job.startedAt)}</div>
              <div className="text-[11px] text-muted">{j.duration.replace("{value}", dur(job.startedAt, job.finishedAt))}</div>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLE[job.status] ?? "bg-gray-100 text-gray-600"}`}>
              {statusLabel[job.status] ?? job.status}
            </span>
            <div className="text-xs text-muted text-end">
              <div><strong>{job.schemaCount}</strong> {j.schemas}</div>
              <div><strong>{job.tableCount}</strong> {j.tables}</div>
            </div>
            <div className="text-xs text-muted">
              <strong>{job.columnCount}</strong> {j.cols}
            </div>
            {job.errorText && (
              <div className="text-[11px] text-red-600 max-w-[180px] truncate" title={job.errorText}>{job.errorText}</div>
            )}
            <span className="text-muted text-xs">{expandedId === job.jobId ? "▲" : "▼"}</span>
          </button>

          {expandedId === job.jobId && (
            <div dir="ltr" className="border-t border-line bg-gray-950 px-5 py-4 font-mono text-[11px] max-h-72 overflow-y-auto">
              {logsLoading === job.jobId && <div className="text-gray-400">{j.loadingLogs}</div>}
              {(logs.get(job.jobId) ?? []).map(log => (
                <div key={log.logId} className={`flex gap-3 py-0.5 ${log.level === "ERROR" ? "text-red-400" : log.level === "WARN" ? "text-yellow-400" : "text-green-300"}`}>
                  <span className="text-gray-500 shrink-0">{new Date(log.loggedAt).toLocaleTimeString("en-GB")}</span>
                  <span className={`shrink-0 font-bold ${log.level === "ERROR" ? "text-red-400" : log.level === "WARN" ? "text-yellow-300" : "text-blue-400"}`}>[{log.level}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
              {logs.has(job.jobId) && logs.get(job.jobId)!.length === 0 && (
                <div className="text-gray-500">{j.noLogEntries}</div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Compliance/Reports/Translations export+import jobs — moved here from
          each feature's own page so every background job's history lives in
          one place, matching this page's existing Crawl Job History above. */}
      <div className="mt-8">
        <h2 className="text-base font-bold text-ink mb-3">{j.backgroundJobs}</h2>
        <BackgroundJobsPanel jobTypeCodes={BACKGROUND_JOB_TYPES} jobTypeLabels={j.types} title={j.backgroundJobsSubtitle} />
      </div>
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AuditLogsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "audit";
  const { t } = useLang();
  const SUB_TABS = [
    { id: "audit",    label: t.auditLog.tabAudit },
    { id: "job-logs", label: t.auditLog.tabJobLogs },
    { id: "data-access", label: t.privacy.tabDataAccess },
  ];

  return (
    <div>
      <div className="border-b border-line bg-white px-8">
        <nav className="flex items-center gap-0">
          {SUB_TABS.map(st => (
            <button
              key={st.id}
              onClick={() => router.replace(`/admin/audit-logs?tab=${st.id}`)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === st.id
                  ? "text-brand-purple border-brand-purple"
                  : "text-ink-soft border-transparent hover:text-brand-deep hover:border-brand-purple/30"
              }`}
            >
              {st.label}
            </button>
          ))}
        </nav>
      </div>
      {tab === "audit"    && <AuditSection />}
      {tab === "job-logs" && <JobLogsSection />}
      {tab === "data-access" && <DataAccessLogSection />}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <Suspense>
      <AuditLogsInner />
    </Suspense>
  );
}
