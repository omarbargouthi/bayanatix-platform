"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";

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
        <button onClick={() => setShowHistory(true)} className="btn btn-sm">
          History
        </button>
        {canEdit && (
          <button onClick={suggestColumnTypes} disabled={classifying} className="btn btn-sm disabled:opacity-50" title={result ?? undefined}>
            {classifying ? "Suggesting…" : "Suggest Column Types"}
          </button>
        )}
        <button className="btn btn-primary btn-sm">+ Custom Attribute</button>
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
    </>
  );
}
