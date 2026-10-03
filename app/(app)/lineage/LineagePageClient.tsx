"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { LineageGraphClient } from "@/components/lineage/LineageGraphClient";
import { PbixUploadButton } from "@/components/lineage/PbixUploadButton";
import { LineageImportButton } from "@/components/lineage/LineageImportButton";

type AssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";

export function LineagePageClient({
  initialAssetType, initialAssetId, canManage,
}: {
  initialAssetType: AssetType | null;
  initialAssetId: number | null;
  canManage: boolean;
}) {
  const { t } = useLang();
  const [reloadSignal, setReloadSignal] = useState(0);
  return (
    <main className="px-8 py-7 pb-14">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{t.lineage.pageTitle}</h1>
          <p className="text-sm text-muted mt-1">{t.lineage.pageDesc}</p>
        </div>
        {canManage && (
          <div className="flex items-start gap-2 shrink-0">
            <LineageImportButton onImported={() => setReloadSignal((n) => n + 1)} />
            <PbixUploadButton />
            <Link href="/lineage/stitching" className="btn btn-sm shrink-0">
              Stitching Review
            </Link>
          </div>
        )}
      </div>
      <div className="w-full rounded-xl overflow-hidden border border-line" style={{ height: "calc(100vh - 220px)" }}>
        <LineageGraphClient
          initialAssetType={initialAssetType}
          initialAssetId={initialAssetId}
          canManage={canManage}
          reloadSignal={reloadSignal}
        />
      </div>
    </main>
  );
}
