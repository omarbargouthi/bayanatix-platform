"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { RecentAsset } from "@/lib/types";

export function RecentAssetsWidget({ assets }: { assets: RecentAsset[] }) {
  const { t } = useLang();
  const h = t.homepage;
  if (assets.length === 0) return <p className="text-[12px] text-muted">{h.recentAssets.empty}</p>;
  return (
    <ul className="space-y-2">
      {assets.map((a) => (
        <li key={`${a.assetType}-${a.assetId}`}>
          <Link href={a.href} className="flex items-center justify-between gap-2 text-[12px] font-medium text-ink hover:text-brand-purple hover:underline">
            <span className="truncate">{a.assetName}</span>
            <span className="text-[10px] text-muted uppercase shrink-0">{a.assetType}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
