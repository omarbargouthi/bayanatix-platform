"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Notification } from "@/lib/types";

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

const TYPE_LABEL: Record<string, string> = {
  REVIEW:         "Review",
  CERTIFICATION:  "Certification",
  CLASSIFICATION: "Classification",
  QUALITY:        "Quality",
  WORKFLOW:       "Workflow",
};

const TYPE_COLOR: Record<string, string> = {
  REVIEW:         "bg-blue-50 text-blue-700",
  CERTIFICATION:  "bg-emerald-50 text-emerald-700",
  CLASSIFICATION: "bg-purple-50 text-purple-700",
  QUALITY:        "bg-red-50 text-red-700",
  WORKFLOW:       "bg-amber-50 text-amber-700",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function NotificationPanel({ open, onClose }: Props) {
  const [items, setItems]       = useState<Notification[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

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
          "fixed top-0 right-0 z-50 h-full w-[380px] bg-white shadow-2xl border-l border-line",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-brand-deep">Notifications</h2>
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
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="w-7 h-7 grid place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto nice-scroll">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
              Loading…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted">
              <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="text-sm">No notifications</span>
            </div>
          )}
          {!loading && items.map((n) => (
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
                    {TYPE_LABEL[n.type] ?? n.type}
                  </span>
                  <span className="text-[11px] text-muted shrink-0">{timeAgo(n.createdAt)}</span>
                </div>

                {/* Title */}
                <div className={`text-[13px] leading-snug mb-1 ${!n.isRead ? "font-semibold text-ink" : "font-medium text-ink-soft"}`}>
                  {n.title}
                </div>

                {/* Body */}
                {n.body && (
                  <p className="text-[12px] text-muted leading-relaxed mb-2">{n.body}</p>
                )}

                {/* Action button */}
                {n.actionLabel && n.actionHref && (
                  <Link
                    href={n.actionHref}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-purple hover:underline"
                  >
                    {n.actionLabel}
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                )}
              </div>

              {/* Unread dot */}
              {!n.isRead && (
                <div className="shrink-0 mt-1.5">
                  <span className="block w-1.5 h-1.5 rounded-full bg-brand-purple" />
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
