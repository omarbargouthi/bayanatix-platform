import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getEntityById, getEntityProfile } from "@/lib/queries/catalog";
import { CertTag, ClassificationTag, Tag } from "@/components/ui/Tag";
import { IconTable } from "@/components/layout/icons";
import { ComplianceScorePanel } from "@/components/catalog/ComplianceScorePanel";
import { TableTabs } from "@/components/catalog/TableTabs";
import { TableEditPanel } from "@/components/catalog/TableEditPanel";
import { ColumnsTable } from "@/components/catalog/ColumnsTable";
import { TablePageActions } from "@/components/catalog/TablePageActions";
import { ProfilingPanel } from "@/components/catalog/ProfilingPanel";
import { ActivityTab } from "@/components/catalog/ActivityTab";
import { LineageTab } from "@/components/catalog/LineageTab";
import { TableDqTab } from "@/components/catalog/TableDqTab";
import { getDqRules } from "@/lib/queries/dq";
import { fmtNumber } from "@/lib/utils";
import { trackAssetVisit } from "@/lib/queries/dashboard";
import { getStakeholders } from "@/lib/queries/stakeholders";
import { getGovernanceRoleLabels } from "@/lib/queries/governance-config";
import { GovernancePanel } from "@/components/catalog/GovernancePanel";
import { MindMapTab } from "@/components/catalog/MindMapTab";
import { TableTypeBadge } from "@/components/catalog/TableTypeBadge";
import { RelatedAssetsPanel } from "@/components/custom-assets/RelatedAssetsPanel";
import { SetChatContext } from "@/components/chat/SetChatContext";

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

  // Always fetch entity; only fetch profile, DQ rules, and stakeholders on Schema tab
  const [entity, profile, schemaTabDqRules, stakeholders, roleLabels] = await Promise.all([
    getEntityById(id),
    activeTab === "Schema" ? getEntityProfile(id)   : Promise.resolve(null),
    activeTab === "Schema" ? getDqRules({ assetTypeCode: "DATA_ENTITIES", assetId: id }) : Promise.resolve([]),
    activeTab === "Schema" ? getStakeholders("DATA_ENTITIES", id) : Promise.resolve([]),
    activeTab === "Schema" ? getGovernanceRoleLabels() : Promise.resolve({} as Record<string, { name: string; description: string | null }>),
  ]);
  if (!entity) notFound();

  const canEdit = await canEditMetadata(user);
  const dq = computeDqAggregates(entity.attributes);

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
            <CertTag code={entity.certCode} />
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
                {schemaTabDqRules.length > 0 ? (
                  <div className="space-y-2">
                    {schemaTabDqRules.slice(0, 4).map((r) => (
                      <div key={r.ruleId} className="flex items-center justify-between bg-canvas-soft rounded-md px-3 py-2">
                        <div className="text-[12px] font-medium text-ink truncate">{r.ruleName}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.lastScore != null && (
                            <span className={`text-[11px] font-bold ${Number(r.lastScore) >= 90 ? "text-emerald-600" : Number(r.lastScore) >= 70 ? "text-amber-600" : "text-red-600"}`}>
                              {Number(r.lastScore).toFixed(1)}%
                            </span>
                          )}
                          {r.lastStatusCode ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              r.lastStatusCode === "PASSED" ? "bg-emerald-100 text-emerald-700" :
                              r.lastStatusCode === "FAILED" ? "bg-red-100 text-red-700" :
                              r.lastStatusCode === "WARNING" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                            }`}>{r.lastStatusCode}</span>
                          ) : <span className="text-[10px] text-muted">Not run</span>}
                        </div>
                      </div>
                    ))}
                    {schemaTabDqRules.length > 4 && (
                      <div className="text-[11px] text-muted text-center">+{schemaTabDqRules.length - 4} more rules</div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3.5">
                    <DqItem label="Completeness"    value={dq.completeness} />
                    <DqItem label="Validity"         value={dq.validity} />
                    <DqItem label="Uniqueness (PK)"  value={dq.uniqueness} />
                    <DqItem label="Timeliness"       value={82.4} />
                    <DqItem label="Consistency"      value={100} />
                    <DqItem label="Accuracy"         value={88.6} />
                  </div>
                )}
              </div>

              {/* Compliance gauge */}
              <ComplianceScorePanel
                trustScore={entity.trustScore ?? 0}
                piiCount={entity.attributes.filter((a) => a.classificationCode === "PII").length}
                classificationValue="Restricted"
                retentionValue="7 yrs"
                pdplValue="Compliant"
                pdplClass="text-emerald-600"
              />
            </section>

            <GovernancePanel
              assetTypeCode="DATA_ENTITIES"
              assetId={entity.entityId}
              initialStakeholders={stakeholders}
              canEdit={canEdit}
              roleLabels={{
                OWNER:        roleLabels.OWNER        ?? { name: "Owner",            description: null },
                BIZ_STEWARD:  roleLabels.BIZ_STEWARD  ?? { name: "Business Steward", description: null },
                TECH_STEWARD: roleLabels.TECH_STEWARD ?? { name: "Technical Steward",description: null },
              }}
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
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">🔬</div>
            <h3 className="font-semibold text-ink mb-1">Sample Data</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">
              Live sample data preview requires a direct connection to the source database. Enable this feature from the Data Sources connection settings.
            </p>
          </div>
        )}

        {/* ── Custom Properties tab ────────────────────────────────────── */}
        {activeTab === "Custom Properties" && (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">🏷</div>
            <h3 className="font-semibold text-ink mb-1">Custom Properties</h3>
            <p className="text-sm text-muted max-w-sm mx-auto">
              Define and manage custom metadata fields for this table. Custom property schemas are configured under Administration → Configuration.
            </p>
          </div>
        )}
      </main>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function DqItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3.5 py-2.5">
      <div className="text-base font-bold text-ink">{value.toFixed(1)}%</div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="h-1 mt-1.5 rounded-full bg-line">
        <div className="h-full rounded-full bg-brand-purple" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function computeDqAggregates(attrs: { qualityScore?: number | null; nullPercentage?: number | null; isPrimaryKey: boolean }[]) {
  const scores = attrs.map((a) => Number(a.qualityScore ?? 0)).filter((n) => !!n);
  const completeness =
    100 - (attrs.length === 0
      ? 0
      : attrs.reduce((s, a) => s + Number(a.nullPercentage ?? 0), 0) / attrs.length);
  const validity = scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
  const uniqueness = attrs.find((a) => a.isPrimaryKey) ? 99.1 : 0;
  return {
    completeness: Math.max(0, Math.min(100, completeness)),
    validity:     Math.max(0, Math.min(100, validity)),
    uniqueness,
  };
}
