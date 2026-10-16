"use client";
import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { ClassificationProposal } from "@/lib/chat/classification-apply";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));

// The classification changes Ask Bayanis proposed, under its answer: the user unticks
// any, confirms, and applies. Shown only when an administrator allows applying advice
// (Configuration › Ask Bayanis); the server re-checks that and the user's rights.
export function ApplyCard({ messageId, proposal, onApplied }: {
  messageId: number; proposal: ClassificationProposal; onApplied: (p: ClassificationProposal) => void;
}) {
  const { t, lang } = useLang();
  const c = t.chat;
  const [picked, setPicked] = useState<number[]>(proposal.changes.map((x) => x.columnId));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = proposal.applied;

  async function apply() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/chat/messages/${messageId}/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columnIds: picked }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(fill(c.applyFailed, { error: res.error ?? r.status })); return; }
      onApplied(res.proposal);
      setConfirming(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 border border-brand-purple/30 bg-white rounded-lg p-2.5 space-y-2 text-[12px]">
      <div className="font-semibold text-brand-deep">{c.applyTitle}</div>
      {!done && <p className="text-muted">{c.applyHint}</p>}
      <ul className="space-y-1">
        {proposal.changes.map((x) => {
          const on = done ? done.columnIds.includes(x.columnId) : picked.includes(x.columnId);
          return (
            <li key={x.columnId}>
              <label className={`flex items-start gap-2 ${done ? "" : "cursor-pointer"}`}>
                <input type="checkbox" className="accent-brand-purple mt-0.5" checked={on} disabled={!!done || busy}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, x.columnId] : picked.filter((id) => id !== x.columnId))} />
                <span>
                  <code dir="ltr" className="text-ink">{x.column}</code> → <span className="font-medium text-ink" dir="ltr">{x.term}</span>
                  {x.level && <span className="text-muted"> ({x.level})</span>}
                  {x.currentTerm && <span className="text-amber-700"> · {fill(c.currentTerm, { term: x.currentTerm })}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {done ? (
        <p className="text-emerald-700">
          {fill(c.applied, { n: done.columnIds.length, date: new Date(done.at).toLocaleString(lang) })}{" "}
          {done.requestId && <Link href={`/requests/${done.requestId}`} className="text-brand-purple hover:underline">{fill(c.appliedRequest, { id: done.requestId })}</Link>}
        </p>
      ) : confirming ? (
        <div className="space-y-1.5">
          <p className="text-ink">{fill(c.applyConfirm, { n: picked.length, table: proposal.table })}</p>
          <div className="flex gap-1.5">
            <button onClick={apply} disabled={busy} className="btn btn-primary btn-sm">{busy ? c.applying : c.applyConfirmYes}</button>
            <button onClick={() => setConfirming(false)} disabled={busy} className="btn btn-sm">{t.common.cancel}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} disabled={picked.length === 0} className="btn btn-primary btn-sm">
          {fill(c.applyButton, { n: picked.length })}
        </button>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
