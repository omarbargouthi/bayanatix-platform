"use client";

import { useState } from "react";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";

export function TablePageActions({
  entityId,
  entityName,
}: {
  entityId:   number;
  entityName: string;
}) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2">
        <button className="btn btn-sm">★ Follow</button>
        <button className="btn btn-sm">Request Access</button>
        <button onClick={() => setShowHistory(true)} className="btn btn-sm">
          History
        </button>
        <button className="btn btn-primary btn-sm">+ Custom Attribute</button>
      </div>

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
