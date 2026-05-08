import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSchemaById } from "@/lib/queries/catalog";
import { CertTag, Tag } from "@/components/ui/Tag";
import { AvatarStack } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconDB, IconTable, IconChevron } from "@/components/layout/icons";
import { fmtNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchemaPage({ params }: { params: { schemaId: string } }) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.schemaId);
  if (!Number.isFinite(id)) notFound();
  const schema = await getSchemaById(id);
  if (!schema) notFound();

  const tables = schema.entities.filter((e) => !e.isView);
  const views = schema.entities.filter((e) => e.isView);
  const totalCols = schema.entities.reduce((s, e) => s + (e.columnCount ?? 0), 0);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog", href: "/catalog" },
          ...(schema.source ? [{ label: schema.source.sourceName, href: "/catalog" }] : []),
          { label: schema.schemaName },
        ]}
        user={user}
      />

      <main className="px-8 py-7 pb-14">
        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* Tree panel */}
          <aside className="card p-3.5 self-start sticky top-24">
            <h4 className="text-[11px] uppercase tracking-wider text-muted px-3 pb-2.5">Data Assets</h4>
            <div className="text-sm">
              {schema.source && (
                <div className="flex items-center gap-2.5 px-3 py-2 font-semibold text-ink">
                  <svg className="w-[18px] h-[18px] text-brand-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/></svg>
                  {schema.source.sourceName}
                </div>
              )}
              <div className="flex items-center gap-2.5 pl-7 pr-3 py-2 rounded-md bg-brand-purple/10">
                <IconDB className="w-[18px] h-[18px] text-brand-purple" />
                <span className="text-brand-purple font-semibold">{schema.schemaName}</span>
              </div>
              {schema.entities.map((e) => (
                <Link
                  key={e.entityId}
                  href={`/catalog/${schema.schemaId}/tables/${e.entityId}`}
                  className="flex items-center gap-2.5 pl-12 pr-3 py-1.5 rounded-md hover:bg-canvas text-ink-soft hover:text-ink"
                >
                  <IconTable className="w-4 h-4" />
                  <span className="truncate">{e.entityName}</span>
                </Link>
              ))}
            </div>
          </aside>

          {/* Right column: hero + tables list */}
          <section>
            <div className="rounded-lg border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-6 mb-5">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <h2 className="text-2xl font-bold text-brand-deep flex items-center gap-2">
                    <IconDB className="w-5 h-5 text-brand-purple" />
                    {schema.schemaName}
                    <Tag variant="green">Certified</Tag>
                    <Tag variant="purple">Finance</Tag>
                  </h2>
                  <p className="text-sm text-ink-soft mt-2 max-w-3xl">{schema.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {schema.source && <Tag>Connection: <strong className="ml-1">{schema.source.databaseName}</strong></Tag>}
                    {schema.ownerUserId && <Tag>Owner: <strong className="ml-1">{schema.ownerUserId}</strong></Tag>}
                    <Tag>Updated: <strong className="ml-1">2 hours ago</strong></Tag>
                  </div>
                </div>
                <div className="flex gap-7 shrink-0 text-right">
                  <Stat label="Tables"  value={tables.length} />
                  <Stat label="Views"   value={views.length} />
                  <Stat label="Columns" value={totalCols} />
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="grid grid-cols-[2fr_2fr_1.2fr_1.1fr_1.4fr_1.3fr_1.4fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                <div>Name</div>
                <div>Description</div>
                <div>Category</div>
                <div>Certified</div>
                <div>Stewards</div>
                <div>Trustworthy</div>
                <div>Business View</div>
              </div>
              {schema.entities.map((e) => (
                <Link
                  key={e.entityId}
                  href={`/catalog/${schema.schemaId}/tables/${e.entityId}`}
                  className="grid grid-cols-[2fr_2fr_1.2fr_1.1fr_1.4fr_1.3fr_1.4fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-2 font-semibold text-brand-deep">
                    <IconTable className="w-[18px] h-[18px] text-brand-purple" />
                    {e.entityName}
                  </div>
                  <div className="text-ink-soft text-[13px] line-clamp-2">{e.description ?? "—"}</div>
                  <div><Tag variant="purple">{e.category ?? "—"}</Tag></div>
                  <div><CertTag code={e.certCode} /></div>
                  <div><AvatarStack users={e.stewards ?? []} /></div>
                  <div>
                    <div className="font-bold text-brand-deep">{e.trustScore != null ? `${Math.round(e.trustScore)}%` : "—"}</div>
                    <div className="mt-1"><ProgressBar value={Number(e.trustScore ?? 0)} height={4} /></div>
                  </div>
                  <div><Tag variant="blue">{fmtNumber(e.rowCount as number | null)} rows</Tag></div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold text-brand-deep leading-none">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
    </div>
  );
}
