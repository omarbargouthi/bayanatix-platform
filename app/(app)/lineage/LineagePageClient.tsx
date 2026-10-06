"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MappingRegister } from "@/components/lineage/MappingRegister";
import { PropagationPanel } from "@/components/lineage/PropagationPanel";
import { useLang } from "@/lib/lang-context";
import { LineageGraphClient } from "@/components/lineage/LineageGraphClient";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = searchParams.get("view") === "register" ? "register" : searchParams.get("view") === "propagation" ? "propagation" : "graph";
  const tabs = [
    { id: "graph", label: t.lineageRegister.tabGraph },
    { id: "register", label: t.lineageRegister.tabRegister },
    { id: "propagation", label: t.lineagePropagation.tabPropagation },
  ] as const;
  return (
    <main className="px-8 py-7 pb-14">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{t.lineage.pageTitle}</h1>
          <p className="text-sm text-muted mt-1">{t.lineage.pageDesc}</p>
        </div>
        {canManage && view === "graph" && (
          <div className="flex items-start gap-2 shrink-0">
            <LineageImportButton onImported={() => setReloadSignal((n) => n + 1)} />
            <Link href="/lineage/stitching" className="btn btn-sm shrink-0">
              Stitching Review
            </Link>
          </div>
        )}
      </div>

      <nav className="flex items-center border-b border-line mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => router.replace(tab.id === "graph" ? "/lineage" : `/lineage?view=${tab.id}`, { scroll: false })}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === tab.id ? "text-brand-purple border-brand-purple" : "text-ink-soft border-transparent hover:text-brand-deep"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {view === "graph" ? (
        <div className="w-full rounded-xl overflow-hidden border border-line" style={{ height: "calc(100vh - 270px)" }}>
          <LineageGraphClient
            initialAssetType={initialAssetType}
            initialAssetId={initialAssetId}
            canManage={canManage}
            reloadSignal={reloadSignal}
          />
        </div>
      ) : view === "register" ? (
        <MappingRegister canManage={canManage} initialQuery={searchParams.get("q") ?? ""} />
      ) : (
        <PropagationPanel canManage={canManage} />
      )}
    </main>
  );
}
