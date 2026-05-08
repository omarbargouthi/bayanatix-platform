import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { Donut } from "@/components/ui/Donut";
import { Tag } from "@/components/ui/Tag";
import { AssetTree } from "@/components/catalog/AssetTree";
import { getCatalogStats, getSourcesWithSchemas, getGlossaryRoots } from "@/lib/queries/catalog";
import { fmtNumber } from "@/lib/utils";
import { IconBook } from "@/components/layout/icons";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [stats, sources, glossaries] = await Promise.all([
    getCatalogStats(),
    getSourcesWithSchemas(),
    getGlossaryRoots(),
  ]);
  const glossaryTermCount = glossaries.reduce((s, g) => s + g.termCount, 0);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Catalog" },
        ]}
        user={user}
      />

      <main className="px-8 py-7 pb-14">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            Data Catalog
            <Tag>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              KSA · All sources
            </Tag>
          </h1>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm">Filter</button>
            <button className="btn btn-sm">Export</button>
            <button className="btn btn-primary btn-sm">+ Add Asset</button>
          </div>
        </div>
        <p className="text-ink-soft max-w-2xl mb-7">
          Discover, secure, and improve metadata quality, compliance, and reliability — across every connected source in your enterprise.
        </p>

        {/* Coverage cards */}
        <section className="grid grid-cols-[1.1fr_1fr_1fr] gap-5 mb-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold">SQL Coverage</h3>
              <Tag variant="purple">Last scan · 2h ago</Tag>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-3xl font-extrabold text-brand-deep">71%</div>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-canvas overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-light to-brand-purple" style={{ width: "71%" }} />
                </div>
                <p className="text-[11px] text-muted mt-2">Of catalogued assets have parsed SQL lineage</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 pt-3.5 mt-4 border-t border-line-soft">
              <Mini label="Tables" value={fmtNumber(stats.tables)} />
              <Mini label="Schemas" value={fmtNumber(stats.schemas)} />
              <Mini label="Sources" value={fmtNumber(stats.sources)} />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold">Metadata Quality</h3><Tag variant="green">▲ 4.2%</Tag></div>
            <div className="flex items-center gap-4">
              <Donut value={62.5} label="Score" size={120} strokeWidth={14} gradientId="g-meta" startColor="#6058A0" endColor="#4D4B8D" />
              <div className="flex-1 space-y-1.5">
                <Mini label="Descriptions filled" value="82%" />
                <Mini label="Owners assigned"     value="71%" />
                <Mini label="Glossary linked"     value="54%" />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold">Data Quality</h3><Tag variant="amber">12 issues</Tag></div>
            <div className="flex items-center gap-4">
              <Donut value={62} label="Score" size={120} strokeWidth={14} gradientId="g-dq" startColor="#81B4E1" endColor="#7AA1D0" />
              <div className="flex-1 space-y-1.5">
                <Mini label="Completeness" value="91%" />
                <Mini label="Validity"     value="88%" />
                <Mini label="Uniqueness"   value="64%" />
              </div>
            </div>
          </div>
        </section>

        {/* Data Assets + Glossaries */}
        <section className="grid grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
              <h3 className="font-bold">Data Assets</h3>
              <div className="flex items-center gap-2">
                <button className="btn btn-sm">Sort</button>
                <button className="btn btn-sm">Filter</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
              <Big label="Sources" value={stats.sources} />
              <Big label="Records" value={stats.records} />
              <Big label="Tables"  value={stats.tables} />
              <Big label="Schemas" value={stats.schemas} />
            </div>
            <div className="px-2 py-2">
              <AssetTree sources={sources} />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
              <h3 className="font-bold">Glossaries</h3>
              <button className="btn btn-sm">+ New term</button>
            </div>
            <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
              <Big label="Terms"         value={glossaryTermCount + glossaries.length} />
              <Big label="Categories"    value={glossaries.length} />
              <Big label="Approved"      value="86%" />
              <Big label="Linked assets" value="800" />
            </div>
            <div className="py-2">
              {glossaries.map((g) => (
                <div key={g.glossaryId} className="flex items-center gap-2.5 px-5 py-2.5 hover:bg-canvas">
                  <span className="w-8 h-8 grid place-items-center rounded-md bg-brand-purple/10 text-brand-purple">
                    <IconBook className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-ink truncate">{g.termName}</div>
                  </div>
                  <span className="text-xs text-muted">{g.termCount} terms</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-sm font-bold text-ink">{value}</span>
    </div>
  );
}

function Big({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-extrabold text-brand-deep">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
