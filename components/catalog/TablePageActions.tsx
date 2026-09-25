"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { CertifyAssetModal } from "./CertifyAssetModal";
import { FollowButton } from "./FollowButton";
import { RaiseRequestModal } from "./RaiseRequestModal";
import { EntityBulkExportImportModal } from "@/components/bulk/EntityBulkExportImportModal";
import { IconHistory, IconCollaborate } from "@/components/layout/icons";
import { useLang } from "@/lib/lang-context";

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
  const { t } = useLang();
  const c = t.catalog;
  const [showHistory, setShowHistory] = useState(false);
  const [showCertify, setShowCertify] = useState(false);
  const [showRequestAccess, setShowRequestAccess] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [classifyingSit, setClassifyingSit] = useState(false);
  const [sitResult, setSitResult] = useState<string | null>(null);

  async function suggestColumnTypes() {
    setClassifying(true);
    setResult(null);
    try {
      const res = await fetch(`/api/catalog/entities/${entityId}/classify-columns`, { method: "POST" });
      if (res.ok) {
        const summary = await res.json();
        setResult(c.columnsEvaluatedSummary.replace("{count}", String(summary.attributesEvaluated)).replace("{changed}", String(summary.suggestionsChanged)));
        router.refresh();
      } else {
        setResult(c.classificationFailed);
      }
    } finally {
      setClassifying(false);
    }
  }

  async function suggestSensitiveInfoTypes() {
    setClassifyingSit(true);
    setSitResult(null);
    try {
      const res = await fetch(`/api/catalog/entities/${entityId}/classify-sit`, { method: "POST" });
      if (res.ok) {
        const summary = await res.json();
        setSitResult(c.columnsEvaluatedSummary.replace("{count}", String(summary.attributesEvaluated)).replace("{changed}", String(summary.suggestionsChanged)));
        router.refresh();
      } else {
        setSitResult(c.classificationFailed);
      }
    } finally {
      setClassifyingSit(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <FollowButton assetType="DATA_ENTITIES" assetId={entityId} />
        <button onClick={() => setShowRequestAccess(true)} className="btn btn-sm">{c.requestAccessBtn}</button>
        {canEdit && (
          <button onClick={suggestColumnTypes} disabled={classifying} className="btn btn-sm disabled:opacity-50" title={result ?? undefined}>
            {classifying ? c.suggestingBtn : c.suggestColumnTypesBtn}
          </button>
        )}
        {canEdit && (
          <button onClick={suggestSensitiveInfoTypes} disabled={classifyingSit} className="btn btn-sm disabled:opacity-50" title={sitResult ?? undefined}>
            {classifyingSit ? c.suggestingBtn : c.suggestTermBtn}
          </button>
        )}
        {canEdit && (
          <button onClick={() => setShowBulk(true)} className="btn btn-sm">{c.exportImportBtn}</button>
        )}
        <div className="w-px h-5 bg-line mx-1" />

        {canEdit && (
          <button
            onClick={() => setShowCertify(true)}
            className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-amber-600 transition-colors"
            title={c.certifyTableTooltip}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
            </svg>
          </button>
        )}
        <button
          onClick={() => setShowHistory(true)}
          className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-brand-purple transition-colors"
          title={c.changeHistoryTooltip}
        >
          <IconHistory className="w-4 h-4" />
        </button>
        <Link
          href={`/collaboration?newTitle=${encodeURIComponent(c.discussionTitlePrefix.replace("{name}", entityName))}`}
          className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-canvas-soft hover:text-brand-purple transition-colors"
          title={c.collabThreadsTooltip}
        >
          <IconCollaborate className="w-4 h-4" />
        </Link>
      </div>
      {result && <div className="text-[11px] text-muted mt-1.5 text-right">{result}</div>}
      {sitResult && <div className="text-[11px] text-muted mt-1.5 text-right">{sitResult}</div>}

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
      {showRequestAccess && (
        <RaiseRequestModal
          initialRequestType="GRANT_ACCESS"
          prefilledTarget={{ assetTypeCode: "DATA_ENTITIES", assetId: entityId, assetName: entityName }}
          onClose={() => setShowRequestAccess(false)}
          onSaved={() => { setShowRequestAccess(false); router.refresh(); }}
        />
      )}
      {showBulk && (
        <EntityBulkExportImportModal
          entityIds={[entityId]}
          title={entityName}
          onClose={() => { setShowBulk(false); router.refresh(); }}
        />
      )}
    </>
  );
}
