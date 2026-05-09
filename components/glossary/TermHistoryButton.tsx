"use client";

import { useState } from "react";
import { AssetHistoryDrawer } from "@/components/catalog/AssetHistoryDrawer";

export function TermHistoryButton({
  glossaryId,
  termName,
}: {
  glossaryId: number;
  termName:   string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-sm">
        History
      </button>
      {open && (
        <AssetHistoryDrawer
          assetType="BUSINESS_GLOSSARIES"
          assetId={glossaryId}
          assetName={termName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
