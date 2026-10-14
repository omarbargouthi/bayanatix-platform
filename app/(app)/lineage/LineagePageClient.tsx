"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MappingRegister } from "@/components/lineage/MappingRegister";
import { PropagationPanel } from "@/components/lineage/PropagationPanel";
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
      <div className="mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-deep">{t.lineage.pageTitle}</h1>
          <p className="text-sm text-muted mt-1">{t.lineage.pageDesc}</p>
        </div>
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
