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
import { fmtNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ENTITY_TYPE_LABEL: Record<string, string> = {
  TRANSACTIONAL: "Transactional",
  MASTER:        "Master",
  REFERENCE:     "Lookup / Reference",
  SYSTEM:        "System / Setup",
};

export default async function TablePage({
  params,
}: {
  params: { schemaId: string; tableId: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.tableId);
  if (!Number.isFinite(id)) notFound();
  const [entity, profile] = await Promise.all([
    getEntityById(id),
    getEntityProfile(id),
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

        <TableTabs />

        <section className="grid grid-cols-[1.4fr_1fr] gap-5 mb-6">
          {/* Description + DQ */}
          <div className="card p-5">
            <TableEditPanel
              entityId={entity.entityId}
              description={entity.description}
              displayName={entity.displayName}
              category={entity.category}
              canEdit={canEdit}
            />

            <div className="flex flex-wrap gap-2 mt-4">
              <Tag>PK: <strong className="ml-1">{entity.attributes.find((a) => a.isPrimaryKey)?.physicalName ?? "—"}</strong></Tag>
              {entity.schema && <Tag>Schema: <strong className="ml-1">{entity.schema.schemaName}</strong></Tag>}
              <Tag>Last refreshed: <strong className="ml-1">2 hours ago</strong></Tag>
              <Tag variant="amber">⚠ 3 open questions</Tag>
            </div>

            <h4 className="mt-6 mb-2 font-bold text-sm">Data Quality</h4>
            <div className="grid grid-cols-3 gap-3.5">
              <DqItem label="Completeness"      value={dq.completeness} />
              <DqItem label="Validity"          value={dq.validity} />
              <DqItem label="Uniqueness (PK)"   value={dq.uniqueness} />
              <DqItem label="Timeliness"        value={82.4} />
              <DqItem label="Consistency"       value={100} />
              <DqItem label="Accuracy"          value={88.6} />
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

        {/* Columns table */}
        <ColumnsTable attributes={entity.attributes} canEdit={canEdit} />

        {/* Profiling panel */}
        {profile && (
          <ProfilingPanel profile={profile} attributes={entity.attributes} />
        )}
      </main>
    </>
  );
}

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
