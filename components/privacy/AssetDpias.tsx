"use client";

// The impact assessments an asset is part of, shown on the asset's own page, with a
// shortcut to start one about it, and the daily check's suggestion when there is one.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { DpiaSuggestion, DpiaSummary } from "@/lib/privacy/dpia-types";
import { LevelBadge, StatusBadge, day, reasonText } from "./dpia-ui";
import { NewDpiaDialog } from "./DpiaRegisterTab";

export function AssetDpias({ assetTypeCode, assetId, assetName, canCreate, hideWhenEmpty, className }: {
  assetTypeCode: string; assetId: number; assetName: string; canCreate: boolean;
  /** On pages that already carry a lot, the card only appears once there is something to show. */
  hideWhenEmpty?: boolean; className?: string;
}) {
  const { t } = useLang();
  const d = t.dpia;
  const [items, setItems] = useState<DpiaSummary[] | null>(null);
  const [suggestion, setSuggestion] = useState<DpiaSuggestion | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    fetch(`/api/privacy/dpia?assetType=${encodeURIComponent(assetTypeCode)}&assetId=${assetId}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((res) => { setItems(res.items ?? []); setSuggestion(res.suggestion ?? null); })
      .catch(() => setItems([]));
  }, [assetTypeCode, assetId]);

  if (hideWhenEmpty && !items?.length && !suggestion) return null;
  return (
    <div className={`card p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-sm">{d.assetCardTitle}</h3>
        {canCreate && <button onClick={() => setCreating(true)} className="btn btn-sm">{d.startOne}</button>}
      </div>
      {suggestion && (
        <div className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2" dir="auto">
          {t.dpiaWatch.assetSuggested} {suggestion.reasons.map((r) => reasonText(t, r)).join(" · ")}
        </div>
      )}
      {items?.length === 0 && !suggestion && <p className="text-[13px] text-muted mt-2">{d.assetCardEmpty}</p>}
      <div className="mt-2 divide-y divide-line-soft">
        {items?.map((r) => (
          <div key={r.dpiaId} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/privacy/dpia/${r.dpiaId}`} className="text-[13px] font-semibold text-brand-purple hover:underline">{r.referenceCode}</Link>
              <span className="text-[13px] text-ink ms-2" dir="auto">{r.title}</span>
              <div className="text-[11px] text-muted">{r.decidedAt ? `${d.colDecided} ${day(r.decidedAt)}` : `${d.updated} ${day(r.updatedAt)}`}{r.nextReviewDate ? ` · ${d.colNextReview} ${day(r.nextReviewDate)}` : ""}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0"><LevelBadge level={r.residualLevel} /><StatusBadge status={r.statusCode} /></div>
          </div>
        ))}
      </div>
      {creating && <NewDpiaDialog onClose={() => setCreating(false)} subject={{ typeCode: assetTypeCode, id: assetId, name: assetName }} />}
    </div>
  );
}
