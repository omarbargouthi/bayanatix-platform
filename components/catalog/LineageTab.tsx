import { LineageGraphClient } from "@/components/lineage/LineageGraphClient";

// Embeds the full lineage graph experience (search, table/column-level toggle,
// depth controls, impact report, edge confirmation) directly in the table page
// rather than linking out to a separate top-level page — there is no standalone
// "Data Lineage" nav item anymore.
export function LineageTab({ entityId, canManage }: { entityId: number; entityName: string; canManage: boolean }) {
  return (
    <div className="w-full rounded-xl overflow-hidden border border-line" style={{ height: 720 }}>
      <LineageGraphClient
        initialAssetType="DATA_ENTITIES"
        initialAssetId={entityId}
        canManage={canManage}
        preserveParams={{ tab: "Lineage" }}
      />
    </div>
  );
}
