import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getEntityById } from "@/lib/queries/catalog";
import { CertTag, ClassificationTag, Tag } from "@/components/ui/Tag";
import { Donut } from "@/components/ui/Donut";
import { IconTable } from "@/components/layout/icons";
import { TableTabs } from "@/components/catalog/TableTabs";
import { fmtNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TablePage({
  params,
}: {
  params: { schemaId: string; tableId: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.tableId);
  if (!Number.isFinite(id)) notFound();
  const entity = await getEntityById(id);
  if (!entity) notFound();

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
            {entity.category && <Tag variant="purple">{entity.category}</Tag>}
            <Tag>{entity.isView ? "View" : "Table"} · {fmtNumber(entity.rowCount as number | null)} rows</Tag>
          </h1>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm">★ Follow</button>
            <button className="btn btn-sm">Request Access</button>
            <button className="btn btn-primary btn-sm">+ Custom Attribute</button>
          </div>
        </div>

        <TableTabs />

        <section className="grid grid-cols-[1.4fr_1fr] gap-5 mb-6">
          {/* Description + DQ */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold m-0">Description</h3><button className="btn btn-sm">Edit</button></div>
            <p className="text-ink-soft text-[14px] leading-relaxed">{entity.description ?? "No description provided yet."}</p>

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
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">
              Columns <span className="text-muted text-xs font-normal ml-1.5">{entity.attributes.length} attributes</span>
            </h3>
            <div className="flex items-center gap-2">
              <button className="btn btn-sm">Filter</button>
              <button className="btn btn-sm">Sort</button>
              <button className="btn btn-sm">Profile</button>
            </div>
          </div>
          <div className="grid grid-cols-[36px_1.6fr_1fr_0.9fr_1.1fr_1fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
            <div></div>
            <div>Column</div>
            <div>Type</div>
            <div>Null %</div>
            <div>Sensitivity</div>
            <div>Glossary</div>
            <div>Quality</div>
          </div>
          {entity.attributes.map((a) => (
            <div
              key={a.attributeId}
              className="grid grid-cols-[36px_1.6fr_1fr_0.9fr_1.1fr_1fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
            >
              <div>
                {a.isPrimaryKey ? (
                  <span className="w-[22px] h-[22px] grid place-items-center bg-brand-purple/10 text-brand-purple rounded text-[10px] font-bold">PK</span>
                ) : a.physicalName.endsWith("_id") ? (
                  <span className="w-[22px] h-[22px] grid place-items-center bg-brand-light/30 text-brand-navy rounded text-[10px] font-bold">FK</span>
                ) : null}
              </div>
              <div>
                <div className="font-semibold text-brand-deep">{a.physicalName}</div>
                <div className="text-[11px] text-muted">{a.description ?? a.friendlyName ?? "—"}</div>
              </div>
              <div className="font-mono text-[12px] text-ink-soft">{a.dataType}</div>
              <div>{a.nullPercentage != null ? `${Number(a.nullPercentage).toFixed(1)}%` : "—"}</div>
              <div><ClassificationTag code={a.classificationCode} /></div>
              <div>{a.glossaryTerm ? <Tag variant="blue">{a.glossaryTerm}</Tag> : <span className="text-muted">—</span>}</div>
              <div className="font-bold">{a.qualityScore != null ? `${Number(a.qualityScore).toFixed(1)}%` : "—"}</div>
            </div>
          ))}
        </div>
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
    validity: Math.max(0, Math.min(100, validity)),
    uniqueness,
  };
}
