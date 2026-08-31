"use client";

import { useLang } from "@/lib/lang-context";
import { LineageGraphClient } from "@/components/lineage/LineageGraphClient";

type AssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";

export function LineagePageClient({
  initialAssetType, initialAssetId, canManage,
}: {
  initialAssetType: AssetType | null;
  initialAssetId: number | null;
  canManage: boolean;
}) {
  const { t } = useLang();
  return (
    <main className="px-8 py-7 pb-14">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-brand-deep">{t.lineage.pageTitle}</h1>
        <p className="text-sm text-muted mt-1">{t.lineage.pageDesc}</p>
      </div>
      <div className="w-full rounded-xl overflow-hidden border border-line" style={{ height: "calc(100vh - 220px)" }}>
        <LineageGraphClient
          initialAssetType={initialAssetType}
          initialAssetId={initialAssetId}
          canManage={canManage}
        />
      </div>
    </main>
  );
}
