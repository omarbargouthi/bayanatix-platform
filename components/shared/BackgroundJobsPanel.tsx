"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type BackgroundJob = {
  jobId: number;
  jobTypeCode: string;
  paramsJson: Record<string, unknown> | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  progressProcessed: number | null;
  progressTotal: number | null;
  resultFileName: string | null;
  resultJson: Record<string, unknown> | null;
  hasResultFile: boolean;
  hasLogFile: boolean;
  errorText: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const STATUS_STYLE: Record<BackgroundJob["status"], string> = {
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<BackgroundJob["status"], string> = {
  RUNNING: "Running…", COMPLETED: "Completed", FAILED: "Failed",
};

// Polls GET /api/jobs?jobId= every 1.5s while the job is RUNNING — for
// immediate feedback right after a trigger button fires. The panel's own
// list poll (below) is the durable view; this is just the fast path so the
// user sees progress without waiting for the next list refresh.
export function usePollBackgroundJob(jobId: number | null): BackgroundJob | null {
  const [job, setJob] = useState<BackgroundJob | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (jobId == null) { setJob(null); return; }
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/jobs?jobId=${jobId}`);
      if (!res.ok || cancelled) return;
      const data: BackgroundJob = await res.json();
      if (cancelled) return;
      setJob(data);
      if (data.status === "RUNNING") timerRef.current = setTimeout(poll, 1500);
    }
    void poll();
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, [jobId]);

  return job;
}

function ProgressBar({ job }: { job: BackgroundJob }) {
  if (!job.progressTotal || job.progressTotal <= 0) return null;
  const pct = Math.min(100, Math.round(((job.progressProcessed ?? 0) / job.progressTotal) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full bg-canvas-soft rounded-full overflow-hidden">
        <div className="h-full bg-brand-purple transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted mt-1">{job.progressProcessed ?? 0} / {job.progressTotal} ({pct}%)</div>
    </div>
  );
}

// Short "what was this job actually about" line built from whatever
// paramsJson happens to carry — every job type stashes different keys
// (frameworkId, languageCode, reportCode, fileName...), so this just prints
// whichever of the common ones are present rather than needing a per-type
// formatter.
function paramsSummary(paramsJson: Record<string, unknown> | null): string | null {
  if (!paramsJson) return null;
  const keys = ["frameworkId", "languageCode", "reportCode", "glossaryId", "fileName"];
  const parts = keys
    .filter((k) => paramsJson[k] != null && paramsJson[k] !== "")
    .map((k) => `${k}: ${paramsJson[k]}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function JobRow({ job, typeLabel }: { job: BackgroundJob; typeLabel?: string }) {
  const summary = paramsSummary(job.paramsJson);
  return (
    <div id={`job-${job.jobId}`} className="border border-line rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[job.status]}`}>{STATUS_LABEL[job.status]}</span>
        {typeLabel && <span className="text-[11px] font-semibold text-brand-deep">{typeLabel}</span>}
        <span className="text-[11px] text-muted">Job #{job.jobId}</span>
        <span className="text-[11px] text-muted">{new Date(job.createdAt).toLocaleString()}</span>
      </div>
      {summary && <div className="text-[11px] text-muted mt-1">{summary}</div>}
      {job.status === "RUNNING" && <ProgressBar job={job} />}
      {job.status === "FAILED" && job.errorText && (
        <div className="text-[12px] text-red-600 mt-1.5">{job.errorText}</div>
      )}
      {job.resultJson && (
        <div className="text-[12px] text-ink-soft mt-1.5">
          {Object.entries(job.resultJson).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}
      {job.status !== "RUNNING" && (job.hasResultFile || job.hasLogFile) && (
        <div className="flex items-center gap-3 flex-wrap mt-2">
          {job.hasResultFile && (
            <a href={`/api/jobs/${job.jobId}/file`} className="text-[12px] font-semibold text-brand-purple hover:underline">⭳ Download {job.resultFileName ?? "file"}</a>
          )}
          {job.hasLogFile && (
            <a href={`/api/jobs/${job.jobId}/log-file`} className="text-[12px] font-medium text-muted hover:text-ink hover:underline">⭳ Download log</a>
          )}
        </div>
      )}
    </div>
  );
}

// Drop into any page that triggers export/import background jobs — polls the
// job list for the given type(s) while any of them is RUNNING, shows status/
// progress/result for each, with download links once finished. Pass
// `latestJobId` (the id just returned by a trigger POST) so a brand-new job
// shows up immediately rather than waiting for the next list poll.
export function BackgroundJobsPanel({ jobTypeCodes, latestJobId, title = "Jobs", jobTypeLabels }: {
  jobTypeCodes: string[]; latestJobId?: number | null; title?: string;
  /** Friendly label per job_type_code — useful when the panel lists more than one type together. */
  jobTypeLabels?: Record<string, string>;
}) {
  const [jobs, setJobs] = useState<BackgroundJob[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs?types=${jobTypeCodes.join(",")}`);
    if (!res.ok) return;
    const data = await res.json();
    setJobs(data.data);
  }, [jobTypeCodes]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      await load();
      if (cancelled) return;
    }
    void poll();
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, latestJobId]);

  useEffect(() => {
    if (!jobs?.some((j) => j.status === "RUNNING")) return;
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [jobs, load]);

  if (jobs == null) return null;
  if (jobs.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">{title}</div>
      <div className="space-y-2">
        {jobs.map((j) => <JobRow key={j.jobId} job={j} typeLabel={jobTypeLabels?.[j.jobTypeCode]} />)}
      </div>
    </div>
  );
}
