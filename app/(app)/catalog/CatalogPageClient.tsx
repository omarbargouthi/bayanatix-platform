"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { Donut } from "@/components/ui/Donut";
import { AssetTree } from "@/components/catalog/AssetTree";
import { AddAssetButton } from "@/components/catalog/AddAssetButton";
import { IconBook } from "@/components/layout/icons";
import { fmtNumber } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import type { DataSource, DataSchema } from "@/lib/types";

type CatalogStats = {
  tables: number; schemas: number; sources: number; records: number;
};
type GlossaryRoot = {
  glossaryId: number; termName: string; termCount: number;
};

export function CatalogPageClient({
  stats, sources, glossaries, canEdit,
}: {
  stats: CatalogStats;
  sources: (DataSource & { schemas: DataSchema[] })[];
  glossaries: GlossaryRoot[];
  canEdit: boolean;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const glossaryTermCount = glossaries.reduce((s, g) => s + g.termCount, 0);

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2.5">
          {c.pageTitle}
          <Tag>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            KSA · All sources
          </Tag>
        </h1>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm">{c.filterBtn}</button>
          <button className="btn btn-sm">{c.exportBtn}</button>
          <AddAssetButton />
        </div>
      </div>
      <p className="text-ink-soft max-w-2xl mb-7">{c.pageDesc}</p>

      {/* Coverage cards */}
      <section className="grid grid-cols-[1.1fr_1fr_1fr] gap-5 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-bold">{c.sqlCoverage}</h3>
            <Tag variant="purple">Last scan · 2h ago</Tag>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-3xl font-extrabold text-brand-deep">71%</div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-canvas overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-light to-brand-purple" style={{ width: "71%" }} />
              </div>
              <p className="text-[11px] text-muted mt-2">{c.sqlLinked}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 pt-3.5 mt-4 border-t border-line-soft">
            <Mini label={c.tables}  value={fmtNumber(stats.tables)} />
            <Mini label={c.schemas} value={fmtNumber(stats.schemas)} />
            <Mini label={c.sources} value={fmtNumber(stats.sources)} />
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">{c.metadataQuality}</h3>
            <Tag variant="green">▲ 4.2%</Tag>
          </div>
          <div className="flex items-center gap-4">
            <Donut value={62.5} label={c.score} size={120} strokeWidth={14} gradientId="g-meta" startColor="#6058A0" endColor="#4D4B8D" />
            <div className="flex-1 space-y-1.5">
              <Mini label={c.descFilled}     value="82%" />
              <Mini label={c.ownersAssigned} value="71%" />
              <Mini label={c.glossaryLinked} value="54%" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">{c.dataQuality}</h3>
            <Tag variant="amber">12 issues</Tag>
          </div>
          <div className="flex items-center gap-4">
            <Donut value={62} label={c.score} size={120} strokeWidth={14} gradientId="g-dq" startColor="#81B4E1" endColor="#7AA1D0" />
            <div className="flex-1 space-y-1.5">
              <Mini label={c.completeness} value="91%" />
              <Mini label={c.validity}     value="88%" />
              <Mini label={c.uniqueness}   value="64%" />
            </div>
          </div>
        </div>
      </section>

      {/* Data Assets + Glossaries */}
      <section className="grid grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">{c.dataAssets}</h3>
            <div className="flex items-center gap-2">
              <button className="btn btn-sm">{c.sortBtn}</button>
              <button className="btn btn-sm">{c.filterBtn}</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
            <Big label={c.sources} value={stats.sources} />
            <Big label={c.records} value={stats.records} />
            <Big label={c.tables}  value={stats.tables} />
            <Big label={c.schemas} value={stats.schemas} />
          </div>
          <div className="px-2 py-2">
            <AssetTree sources={sources} canEdit={canEdit} />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">{c.glossaries}</h3>
            <button className="btn btn-sm">{c.newTerm}</button>
          </div>
          <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
            <Big label={c.terms}        value={glossaryTermCount + glossaries.length} />
            <Big label={c.categories}   value={glossaries.length} />
            <Big label={c.approved}     value="86%" />
            <Big label={c.linkedAssets} value="800" />
          </div>
          <div className="py-2">
            {glossaries.map((g) => (
              <Link key={g.glossaryId} href={`/glossary?domain=${g.glossaryId}`} className="flex items-center gap-2.5 px-5 py-2.5 hover:bg-canvas transition-colors">
                <span className="w-8 h-8 grid place-items-center rounded-md bg-brand-purple/10 text-brand-purple">
                  <IconBook className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-brand-deep hover:underline truncate">{g.termName}</div>
                </div>
                <span className="text-xs text-muted">{g.termCount} {c.termsCount}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
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
