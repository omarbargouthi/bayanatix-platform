"use client";

import { useState, useEffect, useRef } from "react";

export type JobStatus = "RUNNING" | "VALIDATED" | "AWAITING_CONFIRM" | "COMMITTED" | "FAILED" | "CANCELLED";

export type BulkJob = {
  jobId: number;
  jobTypeCode: "DOWNLOAD" | "UPLOAD";
  fileName: string | null;
  status: JobStatus;
  totals: Record<string, unknown> | null;
  createdAt: string;
  finishedAt: string | null;
  errorText: string | null;
  hasFile: boolean;
  hasResultFile: boolean;
  hasLogFile: boolean;
  hasRejectedFile: boolean;
  progressProcessed: number | null;
  progressTotal: number | null;
};

export const STATUS_STYLE: Record<JobStatus, string> = {
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  VALIDATED: "bg-gray-100 text-gray-600 border-gray-200",
  AWAITING_CONFIRM: "bg-amber-50 text-amber-700 border-amber-200",
  COMMITTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  RUNNING: "Running…", VALIDATED: "Validated", AWAITING_CONFIRM: "Awaiting confirmation",
  COMMITTED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled",
};

// Polls GET /api/bulk/jobs/{id} every 1.5s while the job is RUNNING, stopping once
// it reaches a terminal status. Shared by every inline Download/Upload panel (for
// immediate feedback) — the /bulk-operations Jobs tab (the durable list) polls independently.
export function usePollJob(jobId: number | null): BulkJob | null {
  const [job, setJob] = useState<BulkJob | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (jobId == null) { setJob(null); return; }
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/bulk/jobs/${jobId}`);
      if (!res.ok || cancelled) return;
      const data: BulkJob = await res.json();
      if (cancelled) return;
      setJob(data);
      if (data.status === "RUNNING") {
        timerRef.current = setTimeout(poll, 1500);
      }
    }
    void poll();

    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, [jobId]);

  return job;
}

export function ProgressBar({ job }: { job: BulkJob }) {
  if (!job.progressTotal || job.progressTotal <= 0) return null;
  const pct = Math.min(100, Math.round(((job.progressProcessed ?? 0) / job.progressTotal) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full bg-canvas-soft rounded-full overflow-hidden">
        <div className="h-full bg-brand-purple transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted mt-1">{job.progressProcessed ?? 0} / {job.progressTotal} rows ({pct}%)</div>
    </div>
  );
}

export function JobFileLinks({ job }: { job: BulkJob }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mt-2">
      {job.jobTypeCode === "DOWNLOAD" && job.hasFile && (
        <a href={`/api/bulk/jobs/${job.jobId}/file`} className="text-[12px] font-semibold text-brand-purple hover:underline">⭳ Download file</a>
      )}
      {job.jobTypeCode === "UPLOAD" && job.hasResultFile && (
        <a href={`/api/bulk/uploads/${job.jobId}/result-file`} className="text-[12px] font-semibold text-brand-purple hover:underline">⭳ Download result workbook</a>
      )}
      {job.jobTypeCode === "UPLOAD" && job.hasRejectedFile && (
        <a href={`/api/bulk/uploads/${job.jobId}/rejected-file`} className="text-[12px] font-semibold text-red-600 hover:underline">⭳ Download rejected records</a>
      )}
      {job.hasLogFile && (
        <a href={`/api/bulk/jobs/${job.jobId}/log-file`} className="text-[12px] font-medium text-muted hover:text-ink hover:underline">⭳ Download log</a>
      )}
    </div>
  );
}

export function JobStatusCard({ job, title }: { job: BulkJob; title: string }) {
  return (
    <div className="border border-line rounded-lg px-4 py-3 mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-ink">{title}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[job.status]}`}>{STATUS_LABEL[job.status]}</span>
        <span className="text-[11px] text-muted">Job #{job.jobId}</span>
      </div>
      {job.status === "RUNNING" && <ProgressBar job={job} />}
      {job.status === "FAILED" && job.errorText && (
        <div className="text-[12px] text-red-600 mt-1.5">{job.errorText}</div>
      )}
      {job.status === "COMMITTED" && job.totals && (
        <div className="text-[12px] text-ink-soft mt-1.5">
          {Object.entries(job.totals).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}
      {job.status === "COMMITTED" && <JobFileLinks job={job} />}
    </div>
  );
}
