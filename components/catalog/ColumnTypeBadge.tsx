"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";

// Business/Technical column-type suggestion badge — the column-level counterpart to
// TableTypeBadge.tsx. Unconfirmed suggestions show as a dashed amber pill with
// Accept/Override; Override requires a reason (spec §5) and can optionally add a
// pattern-dictionary exception in one click so the engine learns for next time.
export function ColumnTypeBadge({
  attributeId, physicalName, currentType, suggestedType, confidence, status, canEdit,
}: {
  attributeId: number;
  physicalName: string;
  currentType: string | null;
  suggestedType?: string | null;
  confidence?: number | null;
  status?: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { t } = useLang();
  const c = t.catalog;
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");
  const [addPattern, setAddPattern] = useState(false);
  const [busy, setBusy] = useState(false);

  const label = (code: string | null | undefined) =>
    code === "BUSINESS" ? c.columnTypeBusiness : code === "TECHNICAL" ? c.columnTypeTechnical : code;

  const isConfirmed = status === "ACCEPTED" || status === "OVERRIDDEN" || (!!currentType && !suggestedType);
  const isStale = status === "STALE";

  async function accept() {
    setBusy(true);
    try {
      await fetch(`/api/classification/attributes/${attributeId}/accept`, { method: "POST" });
      router.refresh();
    } finally { setBusy(false); }
  }

  async function submitOverride(classCode: "BUSINESS" | "TECHNICAL") {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      // Pattern exception is scoped to this exact column name (anchored, escaped) —
      // matches the spec's "steward overrides ref_no in this source" example, not a
      // broad regex that could sweep up unrelated columns.
      const escapedName = physicalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await fetch(`/api/classification/attributes/${attributeId}/override`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_code: classCode, reason: reason.trim(),
          add_pattern: addPattern ? { patternGroupCode: "EXCLUDE", regex: `^${escapedName}$`, scopeToSource: true } : undefined,
        }),
      });
      setOverriding(false); setReason(""); setAddPattern(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!suggestedType && !currentType) return null;

  if (isConfirmed && !isStale) {
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{label(currentType)}</span>;
  }

  const confidenceLabel = confidence == null ? "" : confidence >= 0.90 ? c.confidenceHigh : confidence >= 0.70 ? c.confidenceMedium : c.confidenceLow;
  const otherType = suggestedType === "BUSINESS" ? "TECHNICAL" : "BUSINESS";

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-dashed ${isStale ? "border-red-400 bg-red-50 text-red-700" : "border-amber-400 bg-amber-50 text-amber-700"}`}
        title={`${c.suggestedColumnTypeTitle} (${confidenceLabel})`}
      >
        {c.suggestedTypePrefix} {label(suggestedType)}
      </span>
      {canEdit && !overriding && (
        <>
          <button onClick={accept} disabled={busy} className="text-[10px] font-medium text-emerald-700 hover:underline disabled:opacity-50">
            {c.acceptSuggestion}
          </button>
          <button onClick={() => setOverriding(true)} className="text-[10px] font-medium text-muted hover:text-ink hover:underline">
            {c.changeSuggestion}
          </button>
        </>
      )}
      {canEdit && overriding && (
        <span className="flex items-center gap-1.5 bg-white border border-line rounded-lg px-2 py-1.5 shadow-sm">
          <input
            autoFocus
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={c.overrideReasonPlaceholder}
            className="text-[11px] border border-line rounded px-1.5 py-0.5 w-48 focus:outline-none focus:border-brand-purple"
          />
          <label className="flex items-center gap-1 text-[10px] text-muted whitespace-nowrap">
            <input type="checkbox" checked={addPattern} onChange={(e) => setAddPattern(e.target.checked)} className="w-3 h-3" />
            {c.addPatternExceptionLabel}
          </label>
          <button
            onClick={() => submitOverride(otherType)}
            disabled={busy || !reason.trim()}
            className="text-[10px] font-semibold text-white bg-brand-purple rounded px-2 py-0.5 disabled:opacity-40"
          >
            {c.overrideConfirmBtn} → {label(otherType)}
          </button>
          <button onClick={() => { setOverriding(false); setReason(""); }} className="text-[10px] text-muted hover:text-ink">✕</button>
        </span>
      )}
    </span>
  );
}
