"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// "Request review" on a lineage link that doesn't look right — instead of
// confirming or deleting it in place, ask the target table's owners to review.
export function ReviewRequestModal({ lineageId, label, onClose, onDone }: {
  lineageId: number; label: string; onClose: () => void; onDone?: () => void;
}) {
  const { t } = useLang();
  const lr = t.lineageRegister;
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ requestId: number; notified: number } | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/lineage/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineageId, reason, priority }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? lr.actionFailed); return; }
      setDone(d);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-brand-deep">{lr.reviewTitle}</h2>
            <p className="text-[12px] text-ink-soft mt-1 truncate" dir="auto" title={label}>{label}</p>
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {!done ? (
            <>
              <p className="text-[12px] text-muted">{lr.reviewDesc}</p>
              <div>
                <label className="field-label">{lr.reviewReason}</label>
                <textarea className="input-field w-full" rows={3} placeholder={lr.reviewReasonPh} value={reason} onChange={(e) => setReason(e.target.value)} dir="auto" autoFocus />
              </div>
              <div>
                <label className="field-label">{t.lineageTools.priority}</label>
                <select className="input-field w-40" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => <option key={p} value={p}>{t.lineageTools.priorities[p]}</option>)}
                </select>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
            </>
          ) : (
            <div className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {done.notified > 0 ? fill(lr.reviewSentNotified, { id: done.requestId, n: done.notified }) : fill(lr.reviewSent, { id: done.requestId })}{" "}
              <Link href={`/requests/${done.requestId}`} className="font-semibold underline">{fill(lr.requestNo, { id: done.requestId })}</Link>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{done ? t.common.close : t.common.cancel}</button>
          {!done && <button onClick={submit} disabled={busy || !reason.trim()} className="btn btn-primary btn-sm">{busy ? lr.submitting : lr.submit}</button>}
        </div>
      </div>
    </div>
  );
}
