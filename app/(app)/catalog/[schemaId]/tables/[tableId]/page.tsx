import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getEntityById, getEntityProfile, CDE_CLASSIFICATION_CODES } from "@/lib/queries/catalog";
import { CertTag, ClassificationTag, Tag } from "@/components/ui/Tag";
import { IconTable } from "@/components/layout/icons";
import { TableHealthPanel } from "@/components/catalog/TableHealthPanel";
import { TableTabs } from "@/components/catalog/TableTabs";
import { TableEditPanel } from "@/components/catalog/TableEditPanel";
import { ColumnsTable } from "@/components/catalog/ColumnsTable";
import { TablePageActions } from "@/components/catalog/TablePageActions";
import { ProfilingPanel } from "@/components/catalog/ProfilingPanel";
import { ActivityTab } from "@/components/catalog/ActivityTab";
import { LineageTab } from "@/components/catalog/LineageTab";
import { TableDqTab } from "@/components/catalog/TableDqTab";
import { getDqRules, getTableDqDimensions } from "@/lib/queries/dq";
import { fmtNumber } from "@/lib/utils";
import { trackAssetVisit } from "@/lib/queries/dashboard";
import { GovernancePanel } from "@/components/catalog/GovernancePanel";
import { MindMapTab } from "@/components/catalog/MindMapTab";
import { TableTypeBadge } from "@/components/catalog/TableTypeBadge";
import { RelatedAssetsPanel } from "@/components/custom-assets/RelatedAssetsPanel";
import { SetChatContext } from "@/components/chat/SetChatContext";
import { CustomAttributesPanel } from "@/components/catalog/CustomAttributesPanel";
import { SampleDataTab } from "@/components/catalog/SampleDataTab";

export const dynamic = "force-dynamic";

const VALID_TABS = ["Schema", "Data Quality", "Activity", "Lineage", "Relationships", "Sample Data", "Custom Properties"] as const;
type Tab = typeof VALID_TABS[number];

function isValidTab(s: string | undefined): s is Tab {
  return VALID_TABS.includes(s as Tab);
}

export default async function TablePage({
  params,
  searchParams,
}: {
  params: { schemaId: string; tableId: string };
  searchParams: { tab?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.tableId);
  if (!Number.isFinite(id)) notFound();

  const activeTab: Tab = isValidTab(searchParams.tab) ? searchParams.tab : "Schema";

  // Always fetch entity; only fetch profile and DQ data on Schema tab
  const [entity, profile, schemaTabDqRules, tableDq] = await Promise.all([
    getEntityById(id),
    activeTab === "Schema" ? getEntityProfile(id)   : Promise.resolve(null),
    activeTab === "Schema" ? getDqRules({ entityId: id }) : Promise.resolve([]),
    activeTab === "Schema" ? getTableDqDimensions(id) : Promise.resolve(null),
  ]);
  if (!entity) notFound();

  const canEdit = await canEditMetadata(user);

  const cdeCount = entity.attributes.filter(
    (a) => a.classTermClassCode && CDE_CLASSIFICATION_CODES.includes(a.classTermClassCode)
  ).length;
  const totalCols = entity.attributes.length;
  const withDescription = entity.attributes.filter((a) => a.description && a.description.trim() !== "").length;
  const withColumnType  = entity.attributes.filter((a) => a.columnType != null).length;
  const metadataCompletionPct         = totalCols > 0 ? Math.round((withDescription / totalCols) * 100) : 0;
  const columnTypeClassificationPct   = totalCols > 0 ? Math.round((withColumnType  / totalCols) * 100) : 0;

  // Fire-and-forget — don't block page render
  void trackAssetVisit(
    user.userId, "TABLE", String(entity.entityId),
    entity.entityName, entity.schema?.schemaName,
    entity.rowCount ?? undefined,
  ).catch(() => {});

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog", href: "/catalog" },
          ...(entity.source ? [{ label: entity.source.sourceName, href: "/catalog" }] : []),
          ...(entity.schema
            ? [{ label: entity.schema.schemaName, href: `/catalog/${entity.schema.schemaId}` }]
            : []),
          { label: entity.entityName },
        ]}
        user={user}
        contextTypes={["COLUMN", "TERM"]}
      />

      <SetChatContext assetType="DATA_ENTITIES" assetId={entity.entityId} assetName={entity.entityName} />

      <main className="px-8 py-7 pb-14">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold flex items-center gap-2.5 flex-wrap">
            <IconTable className="w-6 h-6 text-brand-purple" />
            {entity.entityName}
            <span className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-muted">Metadata</span>
              <CertTag code={entity.certCode} />
            </span>
            <span className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-muted">Data</span>
              <CertTag code={entity.dataCertCode} />
            </span>
            <TableTypeBadge
              entityId={entity.entityId}
              category={entity.category}
              categoryConfidence={entity.categoryConfidence}
              categoryIsConfirmed={entity.categoryIsConfirmed}
              canEdit={canEdit}
            />
            <Tag>{entity.isView ? "View" : "Table"} · {fmtNumber(entity.rowCount as number | null)} rows</Tag>
          </h1>
          <TablePageActions
            entityId={entity.entityId}
            entityName={entity.entityName}
            canEdit={canEdit}
          />
        </div>

        {/* ── Tabs — need Suspense because TableTabs uses useSearchParams ── */}
        <Suspense fallback={<div className="h-12 border-b border-line mb-5" />}>
          <TableTabs active={activeTab} />
        </Suspense>

        {/* ── Schema tab ──────────────────────────────────────────────── */}
        {activeTab === "Schema" && (
          <>
            <section className="grid grid-cols-[1.4fr_1fr] gap-5 mb-6">
              {/* Description + DQ */}
              <div className="card p-5">
                <TableEditPanel
                  entityId={entity.entityId}
                  description={entity.description}
                  sourceDescription={entity.sourceDescription}
                  displayName={entity.displayName}
                  category={entity.category}
                  canEdit={canEdit}
                />

                <div className="flex flex-wrap gap-2 mt-4">
                  <Tag>PK: <strong className="ml-1">{entity.attributes.find((a) => a.isPrimaryKey)?.physicalName ?? "—"}</strong></Tag>
                  {entity.schema && <Tag>Schema: <strong className="ml-1">{entity.schema.schemaName}</strong></Tag>}
                  <Tag>Last refreshed: <strong className="ml-1">2 hours ago</strong></Tag>
                  {entity.openRequestCount ? (
                    <Tag variant="amber">⚠ {entity.openRequestCount} open question{entity.openRequestCount !== 1 ? "s" : ""}</Tag>
                  ) : null}
                </div>

                <div className="mt-6 flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm">Data Quality</h4>
                  <a href="?tab=Data+Quality" className="text-[11px] text-brand-purple hover:underline">
                    {schemaTabDqRules.length} rule{schemaTabDqRules.length !== 1 ? "s" : ""} → manage
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-3.5">
                  {(tableDq?.dimensions ?? []).map((d) => (
                    <DqItem key={d.dimensionCode} label={d.label} value={d.score} ruleCount={d.ruleCount} />
                  ))}
                </div>
              </div>

              {/* Table health gauge */}
              <TableHealthPanel
                cdeCount={cdeCount}
                metadataCompletionPct={metadataCompletionPct}
                columnTypeClassificationPct={columnTypeClassificationPct}
                overallQualityScore={tableDq?.overallScore ?? null}
              />
            </section>

            <GovernancePanel
              assetType="DATA_ENTITIES"
              assetId={entity.entityId}
              canEdit={canEdit}
            />

            <RelatedAssetsPanel assetTypeCode="DATA_ENTITIES" assetId={entity.entityId} />

            <ColumnsTable attributes={entity.attributes} canEdit={canEdit} />

            {profile && (
              <ProfilingPanel profile={profile} attributes={entity.attributes} />
            )}
          </>
        )}

        {/* ── Data Quality tab ─────────────────────────────────────────── */}
        {activeTab === "Data Quality" && (
          <TableDqTab entityId={entity.entityId} entityName={entity.entityName} canEdit={canEdit} />
        )}

        {/* ── Activity tab ─────────────────────────────────────────────── */}
        {activeTab === "Activity" && (
          <ActivityTab entityId={entity.entityId} />
        )}

        {/* ── Lineage tab ──────────────────────────────────────────────── */}
        {activeTab === "Lineage" && (
          <LineageTab entityId={entity.entityId} entityName={entity.entityName} canManage={user.role === "ADMIN" || user.role === "STEWARD"} />
        )}

        {/* ── Relationships tab ────────────────────────────────────────── */}
        {activeTab === "Relationships" && (
          <MindMapTab assetId={entity.entityId} assetType="DATA_ENTITIES" entityName={entity.entityName} />
        )}

        {/* ── Sample Data tab ──────────────────────────────────────────── */}
        {activeTab === "Sample Data" && (
          <SampleDataTab entityId={entity.entityId} entityName={entity.entityName} />
        )}

        {/* ── Custom Properties tab ────────────────────────────────────── */}
        {activeTab === "Custom Properties" && (
          <CustomAttributesPanel assetType="DATA_ENTITIES" assetId={id} canEdit={canEdit} showEmptyState />
        )}
      </main>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function DqItem({ label, value, ruleCount }: { label: string; value: number | null; ruleCount: number }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3.5 py-2.5">
      <div className="text-base font-bold text-ink">{value != null ? `${value.toFixed(1)}%` : "—"}</div>
      <div className="text-[11px] text-muted">{label}</div>
      {value != null ? (
        <div className="h-1 mt-1.5 rounded-full bg-line">
          <div className="h-full rounded-full bg-brand-purple" style={{ width: `${value}%` }} />
        </div>
      ) : (
        <div className="text-[10px] text-muted italic mt-1.5">
          {ruleCount > 0 ? "Not run yet" : "No rules assigned"}
        </div>
      )}
    </div>
  );
}
