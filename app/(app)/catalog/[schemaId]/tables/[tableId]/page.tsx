import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata, canViewCatalogAsset } from "@/lib/can";
import { getEntityById, getEntityProfile, CDE_CLASSIFICATION_CODES } from "@/lib/queries/catalog";
import { CertBadge, ClassificationTag, Tag, LifecycleBadge } from "@/components/ui/Tag";
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
import { ViewAnatomyTab } from "@/components/lineage/ViewAnatomyPanel";
import { isViewType } from "@/lib/object-types";
import { getServerT } from "@/lib/i18n/server";
import type { I18nStrings } from "@/lib/i18n/strings";

export const dynamic = "force-dynamic";

const VALID_TABS = ["Schema", "Data Quality", "Activity", "Lineage", "View Definition", "Relationships", "Sample Data", "Custom Properties"] as const;
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
  if (!(await canViewCatalogAsset(user, { entityId: id }))) redirect("/catalog");

  const activeTab: Tab = isValidTab(searchParams.tab) ? searchParams.tab : "Schema";

  // Always fetch entity; only fetch profile and DQ data on Schema tab
  const [entity, profile, schemaTabDqRules, tableDq] = await Promise.all([
    getEntityById(id),
    activeTab === "Schema" ? getEntityProfile(id)   : Promise.resolve(null),
    activeTab === "Schema" ? getDqRules({ entityId: id }) : Promise.resolve([]),
    activeTab === "Schema" ? getTableDqDimensions(id) : Promise.resolve(null),
  ]);
  if (!entity) notFound();
  const entityIsView = isViewType(entity.objectTypeCode) || entity.isView;

  const canEdit = await canEditMetadata(user);

  const cdeCount = entity.attributes.filter(
    (a) => a.classTermClassCode && CDE_CLASSIFICATION_CODES.includes(a.classTermClassCode)
  ).length;
  const totalCols = entity.attributes.length;
  const withDescription = entity.attributes.filter((a) => a.description && a.description.trim() !== "").length;
  const withColumnType  = entity.attributes.filter((a) => a.columnType != null).length;
  const metadataCompletionPct         = totalCols > 0 ? Math.round((withDescription / totalCols) * 100) : 0;
  const columnTypeClassificationPct   = totalCols > 0 ? Math.round((withColumnType  / totalCols) * 100) : 0;

  // Fire-and-forget — don't block page render. assetMeta is the schema's id
  // (not its name — schema names aren't unique across sources, which caused
  // getRecentAssets()'s join to fan out into duplicate rows; see its comment).
  void trackAssetVisit(
    user.userId, "TABLE", String(entity.entityId),
    entity.entityName, entity.schema?.schemaId != null ? String(entity.schema.schemaId) : undefined,
    entity.rowCount ?? undefined,
  ).catch(() => {});
  const t = await getServerT(user);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanis", href: "/dashboard" },
          { label: t.catalog.pageTitle, href: "/catalog" },
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
        {/* Certification badges sit above the name, as on the schema page. */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <CertBadge code={entity.certCode} kind="metadata" />
          <CertBadge code={entity.dataCertCode} kind="data" />
        </div>
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold flex items-center gap-2.5 flex-wrap min-w-0">
            <IconTable className="w-6 h-6 text-brand-purple shrink-0" />
            <span className="min-w-0 truncate" dir="auto" title={entity.entityName}>{entity.entityName}</span>
            <LifecycleBadge status={entity.lifecycleStatus} deprecatedAt={entity.deprecatedAt} />
          </h1>
          <TablePageActions
            entityId={entity.entityId}
            entityName={entity.entityName}
            canEdit={canEdit}
          />
        </div>

        {/* ── Tabs — need Suspense because TableTabs uses useSearchParams ── */}
        <Suspense fallback={<div className="h-12 border-b border-line mb-5" />}>
          <TableTabs active={activeTab} isView={entityIsView} />
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
                  sourceSynced={entity.sourceSynced}
                />

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Tag>{(t.lineage.objectTypes as Record<string, string>)[entity.objectTypeCode ?? ""] ?? (entity.isView ? t.catalog.viewBadge : t.catalog.tableBadge)} · {fmtNumber(entity.rowCount as number | null)} {t.catalog.rowsWord}</Tag>
                  <TableTypeBadge
                    entityId={entity.entityId}
                    category={entity.category}
                    categoryConfidence={entity.categoryConfidence}
                    categoryIsConfirmed={entity.categoryIsConfirmed}
                    canEdit={canEdit}
                  />
                  <Tag>PK: <strong className="ml-1">{entity.attributes.find((a) => a.isPrimaryKey)?.physicalName ?? "—"}</strong></Tag>
                  {entity.schema && (
                    // A real link, not a plain label — this is the table's actual
                    // navigation back to its parent schema, so it should behave like one.
                    // dir="ltr": this "Label: Value" pair keeps LTR direction (matching its
                    // sibling PK/Last-refreshed tags) so under an Arabic (dir="rtl") page the
                    // two runs (the translated prefix and the schema name) don't get
                    // bidi-reordered into "crm :Schema" instead of reading "Schema: crm".
                    <Link href={`/catalog/${entity.schema.schemaId}`} dir="ltr" className="tag hover:bg-brand-purple/10 hover:text-brand-purple transition-colors">
                      {t.catalog.schemaLabelPrefix} <strong className="ml-1">{entity.schema.schemaName}</strong>
                    </Link>
                  )}
                  <Tag>{t.catalog.lastRefreshedLabel} <strong className="ml-1">{t.catalog.lastRefreshedPlaceholderValue}</strong></Tag>
                  {entity.openRequestCount ? (
                    <Tag variant="amber">⚠ {t.catalog.openQuestionsBadge.replace("{n}", String(entity.openRequestCount))}</Tag>
                  ) : null}
                </div>

                <div className="mt-6 flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm">{t.catalog.tabDataQuality}</h4>
                  <a href="?tab=Data+Quality" className="text-[11px] text-brand-purple hover:underline">
                    {t.catalog.rulesManageLink.replace("{n}", String(schemaTabDqRules.length))}
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-3.5">
                  {(tableDq?.dimensions ?? []).map((d) => (
                    <DqItem key={d.dimensionCode} label={DQ_DIMENSION_LABEL(t)[d.dimensionCode] ?? d.dimensionCode} value={d.score} ruleCount={d.ruleCount} t={t} />
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

        {/* ── View Definition tab (views only) ─────────────────────────── */}
        {activeTab === "View Definition" && entityIsView && <ViewAnatomyTab entityId={entity.entityId} />}

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

function DQ_DIMENSION_LABEL(t: I18nStrings): Record<string, string> {
  return {
    COMP: t.catalog.completeness,
    VALIDITY: t.catalog.validity,
    UNIQUENESS: t.catalog.uniqueness,
    FRESHNESS: t.catalog.freshness,
    CONSISTENCY: t.catalog.consistency,
    ACCURACY: t.catalog.accuracy,
  };
}

function DqItem({ label, value, ruleCount, t }: { label: string; value: number | null; ruleCount: number; t: I18nStrings }) {
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
          {ruleCount > 0 ? t.catalog.dqNotRunYet : t.catalog.dqNoRulesAssigned}
        </div>
      )}
    </div>
  );
}
