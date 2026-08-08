"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RelationshipGraphTab } from "./RelationshipGraphTab";

type ResolvedLink = {
  linkId: number;
  label: string;
  otherAssetTypeCode: string;
  otherAssetId: number;
  otherAssetName: string;
  otherAssetHref: string | null;
};

export function RelatedAssetsPanel({ assetTypeCode, assetId, compact }: { assetTypeCode: string; assetId: number; compact?: boolean }) {
  const [links, setLinks] = useState<ResolvedLink[] | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ assetType: assetTypeCode, assetId: String(assetId) });
    fetch(`/api/custom-assets/related?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setLinks(data); });
    return () => { cancelled = true; };
  }, [assetTypeCode, assetId]);

  if (!links || links.length === 0) return null;

  const grouped = new Map<string, ResolvedLink[]>();
  for (const l of links) {
    const arr = grouped.get(l.label) ?? [];
    arr.push(l);
    grouped.set(l.label, arr);
  }

  return (
    <div className={compact ? "mt-2" : "card p-5 mt-5"}>
      <div className="flex items-center justify-between mb-1.5">
        {compact
          ? <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Related Assets</div>
          : <h3 className="font-bold text-sm">Related Assets</h3>}
        <button onClick={() => setShowGraph((v) => !v)} className="text-[10px] font-semibold text-brand-purple hover:underline">
          {showGraph ? "Hide graph" : "View graph"}
        </button>
      </div>
      {showGraph && (
        <div className="mb-3">
          <RelationshipGraphTab assetType={assetTypeCode} assetId={assetId} height={420} />
        </div>
      )}
      <div className="space-y-2">
        {[...grouped.entries()].map(([label, group]) => (
          <div key={label} className="flex items-start gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0 pt-0.5">{label}</span>
            <div className="flex flex-wrap gap-1.5">
              {group.map((l) => (
                l.otherAssetHref ? (
                  <Link key={l.linkId} href={l.otherAssetHref} className="text-[11px] px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 font-medium">
                    {l.otherAssetName}
                  </Link>
                ) : (
                  <span key={l.linkId} className="text-[11px] px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft font-medium">
                    {l.otherAssetName}
                  </span>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
