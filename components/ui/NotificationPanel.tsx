"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/types";
import type { I18nStrings } from "@/lib/i18n/strings";
import { useLang } from "@/lib/lang-context";

type Props = {
  open:    boolean;
  onClose: () => void;
};

const SEVERITY_DOT: Record<string, string> = {
  INFO:    "bg-blue-400",
  SUCCESS: "bg-emerald-400",
  WARNING: "bg-amber-400",
  ERROR:   "bg-red-400",
};

const TYPE_COLOR: Record<string, string> = {
  REVIEW:         "bg-blue-50 text-blue-700",
  CERTIFICATION:  "bg-emerald-50 text-emerald-700",
  CLASSIFICATION: "bg-purple-50 text-purple-700",
  QUALITY:        "bg-red-50 text-red-700",
  WORKFLOW:       "bg-amber-50 text-amber-700",
  COMPLIANCE:     "bg-teal-50 text-teal-700",
  JOB:            "bg-indigo-50 text-indigo-700",
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function timeAgo(iso: string, c: I18nStrings["common"]) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return c.justNow;
  if (mins  < 60) return fill(c.minutesAgo, { n: mins });
  if (hours < 24) return fill(c.hoursAgo, { n: hours });
  return fill(c.daysAgo, { n: days });
}

// English job label (as baked into a stored notification title by the server-side
// notifiers) → job type code, so the title can be re-rendered from t.jobLogs.types.
const JOB_LABEL_TO_CODE: Record<string, keyof I18nStrings["jobLogs"]["types"]> = {
  "Compliance Export":     "GOV_COMPLIANCE_EXPORT",
  "Compliance Import":     "GOV_COMPLIANCE_IMPORT",
  "Report Export (Excel)": "REPORT_EXPORT_XLSX",
  "Report Export (PDF)":   "REPORT_EXPORT_PDF",
  "Translations Export":   "TRANSLATIONS_EXPORT",
  "Translations Import":   "TRANSLATIONS_IMPORT",
  "Bulk Download":         "BULK_DOWNLOAD",
  "Bulk Upload":           "BULK_UPLOAD",
};

// Job notifications are stored as plain English text at insert time (see
// notifyJobFinished / notifyBulkJobFinished / notifyCrawlFinished), with no record
// of who will read them in which language. Their wording is fixed, so the panel
// recognises those formats and re-renders them in the viewer's language; anything
// that doesn't match is shown as stored.
function localizeJobNotification(n: Notification, t: I18nStrings) {
  const nt = t.notifications;
  let title = n.title;
  let body = n.body;

  const crawl = /^Crawl (completed|failed): (.+)$/.exec(n.title);
  const job = /^(.+) (completed|failed)$/.exec(n.title);
  if (crawl) {
    title = fill(crawl[1] === "completed" ? nt.crawlCompleted : nt.crawlFailed, { name: crawl[2] });
  } else if (job && JOB_LABEL_TO_CODE[job[1]]) {
    title = fill(job[2] === "completed" ? nt.jobCompleted : nt.jobFailed, { label: t.jobLogs.types[JOB_LABEL_TO_CODE[job[1]]] });
  }

  if (body) {
    const succeeded = /^Job #(\d+) finished successfully\.$/.exec(body);
    const failed = /^Job #(\d+) failed: ([\s\S]*)$/.exec(body);
    const summary = /^(\d+) schema\(s\), (\d+) table\(s\), (\d+) column\(s\)\.$/.exec(body);
    if (succeeded) body = fill(nt.jobSucceededBody, { id: succeeded[1] });
    else if (failed) body = fill(nt.jobFailedBody, { id: failed[1], error: failed[2] });
    else if (summary) body = fill(nt.crawlSummary, { schemas: summary[1], tables: summary[2], columns: summary[3] });
  }

  const actionLabel = n.actionLabel === "View Job Details" ? nt.viewJobDetails : n.actionLabel;
  return { title, body, actionLabel };
}

// "Jobs" (background export/import completions — see lib/queries/background-jobs.ts's
// notifyJobFinished) vs. everything else ("Operational Activity" — workflow
// assignments, reviews, certifications, classification flags, DQ issues,
// compliance reminders...). Split into two tabs so a burst of job-completion
// noise doesn't bury the activity a user actually needs to act on, and vice versa.
const JOB_NOTIFICATION_TYPE = "JOB";
type NotifTab = "activity" | "jobs";

export function NotificationPanel({ open, onClose }: Props) {
  const { t, isRtl } = useLang();
  const nt = t.notifications;
  const [items, setItems]       = useState<Notification[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [tab, setTab]           = useState<NotifTab>("activity");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data: Notification[]) => {
        setItems(data);
        setHasUnread(data.some((n) => !n.isRead));
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH" });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setHasUnread(false);
  }

  const jobItems      = items.filter((n) => n.type === JOB_NOTIFICATION_TYPE);
  const activityItems = items.filter((n) => n.type !== JOB_NOTIFICATION_TYPE);
  const visibleItems  = tab === "jobs" ? jobItems : activityItems;
  const jobUnread      = jobItems.filter((n) => !n.isRead).length;
  const activityUnread = activityItems.filter((n) => !n.isRead).length;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={[
          // Opens on the side the bell sits on — the header actions move to the left in RTL.
          "fixed top-0 z-50 h-full w-[380px] bg-white shadow-2xl border-line",
          isRtl ? "left-0 border-r" : "right-0 border-l",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : isRtl ? "-translate-x-full" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-brand-deep">{nt.title}</h2>
            {hasUnread && (
              <span className="bg-brand-purple text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {items.filter((n) => !n.isRead).length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasUnread && (
              <button
                onClick={markAllRead}
                className="text-[12px] text-brand-purple hover:underline font-medium"
              >
                {nt.markAllRead}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={nt.closeAria}
              className="w-7 h-7 grid place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-line shrink-0">
          {([
            ["activity", nt.tabActivity, activityUnread],
            ["jobs", nt.tabJobs, jobUnread],
          ] as const).map(([id, label, unread]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors",
                tab === id ? "text-brand-purple border-brand-purple" : "text-ink-soft border-transparent hover:text-brand-deep",
              ].join(" ")}
            >
              {label}
              {unread > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === id ? "bg-brand-purple text-white" : "bg-gray-200 text-gray-700"}`}>
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto nice-scroll">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
              {t.common.loading}
            </div>
          )}
          {!loading && visibleItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted">
              <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="text-sm">{tab === "jobs" ? nt.noJobs : nt.noActivity}</span>
            </div>
          )}
          {!loading && visibleItems.map((n) => {
            const { title, body, actionLabel } = n.type === JOB_NOTIFICATION_TYPE
              ? localizeJobNotification(n, t)
              : { title: n.title, body: n.body, actionLabel: n.actionLabel };
            return (
            <div
              key={n.notificationId}
              className={[
                "flex gap-3 px-5 py-4 border-b border-line-soft transition-colors",
                !n.isRead ? "bg-brand-purple/[0.03]" : "",
              ].join(" ")}
            >
              {/* Severity dot */}
              <div className="shrink-0 mt-1.5">
                <span className={`block w-2 h-2 rounded-full ${SEVERITY_DOT[n.severity] ?? "bg-gray-300"}`} />
              </div>

              <div className="flex-1 min-w-0">
                {/* Type + time */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLOR[n.type] ?? "bg-gray-50 text-gray-600"}`}>
                    {(nt.types as Record<string, string>)[n.type] ?? n.type}
                  </span>
                  <span className="text-[11px] text-muted shrink-0">{timeAgo(n.createdAt, t.common)}</span>
                </div>

                {/* Title */}
                <div className={`flex items-center gap-1.5 text-[13px] leading-snug mb-1 ${!n.isRead ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>
                  {n.actioned && (
                    <span
                      title={nt.actionTaken}
                      className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold"
                    >
                      ✓
                    </span>
                  )}
                  <span>{title}</span>
                </div>

                {/* Body */}
                {body && (
                  <p className="text-[12px] text-muted leading-relaxed mb-2">{body}</p>
                )}

                {/* Action button + downloadable result file */}
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
                  {actionLabel && n.actionHref && (
                    <Link
                      href={n.actionHref}
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-purple hover:underline"
                    >
                      {actionLabel}
                      <svg viewBox="0 0 24 24" className={`w-3 h-3 ${isRtl ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  )}
                  {/* Plain <a>, not <Link> — this is a file response from an API route, not a page. */}
                  {n.downloadHref && (
                    <a
                      href={n.downloadHref}
                      download
                      className="inline-flex items-center gap-1 min-w-0 text-[11px] font-semibold text-brand-purple hover:underline"
                    >
                      <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span className="truncate" title={n.downloadLabel ?? undefined}>
                        {fill(nt.downloadFile, { name: n.downloadLabel ?? t.jobLogs.fileFallback })}
                      </span>
                    </a>
                  )}
                </div>
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div className="shrink-0 mt-1.5">
                  <span className="block w-1.5 h-1.5 rounded-full bg-brand-purple" />
                </div>
              )}
            </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
