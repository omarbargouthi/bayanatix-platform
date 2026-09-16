"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { CertifyAssetModal } from "./CertifyAssetModal";
import { IconHistory, IconCollaborate } from "@/components/layout/icons";

export function TablePageActions({
  entityId,
  entityName,
  canEdit,
}: {
  entityId:   number;
  entityName: string;
  canEdit?:   boolean;
}) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const [showCertify, setShowCertify] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function suggestColumnTypes() {
    setClassifying(true);
    setResult(null);
    try {
      const res = await fetch(`/api/catalog/entities/${entityId}/classify-columns`, { method: "POST" });
      if (res.ok) {
        const summary = await res.json();
        setResult(`${summary.attributesEvaluated} column(s) evaluated, ${summary.suggestionsChanged} suggestion(s) changed`);
        router.refresh();
      } else {
        setResult("Failed to run classification");
      }
    } finally {
      setClassifying(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button className="btn btn-sm">★ Follow</button>
        <button className="btn btn-sm">Request Access</button>
        {canEdit && (
          <button onClick={suggestColumnTypes} disabled={classifying} className="btn btn-sm disabled:opacity-50" title={result ?? undefined}>
            {classifying ? "Suggesting…" : "Suggest Column Types"}
          </button>
        )}
        <div className="w-px h-5 bg-line mx-1" />

        {canEdit && (
          <button
            onClick={() => setShowCertify(true)}
            className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-amber-600 transition-colors"
            title="Certify table"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowHistory(true)}
          className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-brand-purple transition-colors"
          title="Change history"
        >
          <IconHistory className="w-4 h-4" />
        </button>
        <Link
          href={`/collaboration?newTitle=${encodeURIComponent(`Discussion: ${entityName}`)}`}
          className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-brand-purple transition-colors"
          title="Collaboration threads"
        >
          <IconCollaborate className="w-4 h-4" />
        </Link>
      </div>
      {result && <div className="text-[11px] text-muted mt-1.5 text-right">{result}</div>}

      {showHistory && (
        <AssetHistoryDrawer
          assetType="DATA_ENTITIES"
          assetId={entityId}
          assetName={entityName}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showCertify && (
        <CertifyAssetModal
          assetType="DATA_ENTITIES"
          assetId={entityId}
          assetName={entityName}
          onClose={() => setShowCertify(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
