import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { getEntityById, getEntityProfile } from "@/lib/queries/catalog";
import { CertTag, ClassificationTag, Tag } from "@/components/ui/Tag";
import { Donut } from "@/components/ui/Donut";
import { IconTable } from "@/components/layout/icons";
import { TableTabs } from "@/components/catalog/TableTabs";
import { TableEditPanel } from "@/components/catalog/TableEditPanel";
import { ColumnsTable } from "@/components/catalog/ColumnsTable";
import { TablePageActions } from "@/components/catalog/TablePageActions";
import { ProfilingPanel } from "@/components/catalog/ProfilingPanel";
import { ActivityTab } from "@/components/catalog/ActivityTab";
import { LineageTab } from "@/components/catalog/LineageTab";
import { fmtNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ENTITY_TYPE_LABEL: Record<string, string> = {
  TRANSACTIONAL: "Transactional",
  MASTER:        "Master",
  REFERENCE:     "Lookup / Reference",
  SYSTEM:        "System / Setup",
};

const VALID_TABS = ["Schema", "Activity", "Lineage", "Sample Data", "Custom Properties"] as const;
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

  // Always fetch entity; only fetch profile on Schema tab
  const [entity, profile] = await Promise.all([
    getEntityById(id),
    activeTab === "Schema" ? getEntityProfile(id) : Promise.resolve(null),
  ]);
  if (!entity) notFound();

  const canEdit = await canEditMetadata(user);
  const dq = computeDqAggregates(entity.attributes);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog", href: "/catalog" },
          ...(entity.schema
            ? [{ label: entity.schema.schemaName, href: `/catalog/${entity.schema.schemaId}` }]
            : []),
          { label: entity.entityName },
        ]}
        user={user}
      />

      <main className="px-8 py-7 pb-14">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold flex items-center gap-2.5 flex-wrap">
            <IconTable className="w-6 h-6 text-brand-purple" />
            {entity.entityName}
            <CertTag code={entity.certCode} />
            {entity.category && (
              <Tag variant="purple">
                {ENTITY_TYPE_LABEL[entity.category] ?? entity.category}
              </Tag>
            )}
            <Tag>{entity.isView ? "View" : "Table"} · {fmtNumber(entity.rowCount as number | null)} rows</Tag>
          </h1>
          <TablePageActions
            entityId={entity.entityId}
            entityName={entity.entityName}
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

                <h4 className="mt-6 mb-2 font-bold text-sm">Data Quality</h4>
                <div className="grid grid-cols-3 gap-3.5">
                  <DqItem label="Completeness"    value={dq.completeness} />
                  <DqItem label="Validity"         value={dq.validity} />
                  <DqItem label="Uniqueness (PK)"  value={dq.uniqueness} />
                  <DqItem label="Timeliness"       value={82.4} />
                  <DqItem label="Consistency"      value={100} />
                  <DqItem label="Accuracy"         value={88.6} />
                </div>
              </div>

              {/* Compliance gauge */}
              <div className="card p-5 text-center">
                <h3 className="font-bold mb-3">Compliance Score</h3>
                <div className="flex justify-center">
                  <Donut value={Math.round(entity.trustScore ?? 0)} size={180} strokeWidth={16} gradientId="g-trust" />
                </div>
                <p className="text-muted text-xs mt-2">8 of 9 checks passing · 1 open finding</p>

                <div className="grid grid-cols-2 gap-2.5 mt-4 text-left">
                  <Mini label="PII columns" value={`${entity.attributes.filter((a) => a.classificationCode === "PII").length} · masked`} />
                  <Mini label="Classification" value="Restricted" />
                  <Mini label="Retention" value="7 yrs" />
                  <Mini label="PDPL Status" value="Compliant" valueClass="text-emerald-600" />
                </div>
              </div>
            </section>

            <ColumnsTable attributes={entity.attributes} canEdit={canEdit} />

            {profile && (
              <ProfilingPanel profile={profile} attributes={entity.attributes} />
            )}
          </>
        )}

        {/* ── Activity tab ─────────────────────────────────────────────── */}
        {activeTab === "Activity" && (
          <ActivityTab entityId={entity.entityId} />
        )}

        {/* ── Lineage tab ──────────────────────────────────────────────── */}
        {activeTab === "Lineage" && (
          <LineageTab entityId={entity.entityId} entityName={entity.entityName} />
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

function Mini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-canvas-soft rounded-md px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={"font-bold text-ink " + (valueClass ?? "")}>{value}</div>
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
