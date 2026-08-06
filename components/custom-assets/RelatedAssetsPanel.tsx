"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
      {compact
        ? <div className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1.5">Related Assets</div>
        : <h3 className="font-bold text-sm mb-3">Related Assets</h3>}
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
