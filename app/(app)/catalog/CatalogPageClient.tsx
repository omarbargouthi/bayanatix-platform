"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { Donut } from "@/components/ui/Donut";
import { AssetTree } from "@/components/catalog/AssetTree";
import { AddAssetButton } from "@/components/catalog/AddAssetButton";
import { AddAssetModal } from "@/components/catalog/AddAssetModal";
import { IconBook } from "@/components/layout/icons";
import { fmtNumber } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import type { DataSource, DataSchema } from "@/lib/types";
import { CdeDqConfigModal } from "./CdeDqConfigModal";

type CatalogStats = {
  tables: number; schemas: number; sources: number; records: number;
};
type GlossaryRoot = {
  glossaryId: number; termName: string; termCount: number;
};
type GlossaryStats = {
  totalTerms: number; linkedTerms: number; linkedAssets: number;
};
type CdeCoverage = { businessColumns: number; cdeColumns: number };
type ClassificationSegment = { code: string; name: string; count: number };
type BusinessClassification = { total: number; classified: number; segments: ClassificationSegment[] };
type CdeMetadataQuality = { totalCdes: number; completeness: number; accuracy: number; consistency: number };
type CdeDqDimension = {
  dimensionCode: string; label: string; weight: number; isEnabled: boolean;
  score: number | null; ruleCount: number;
};
type CdeDataQuality = { overallScore: number | null; totalCdes: number; dimensions: CdeDqDimension[] };

// Rank-ordered gradient (light → dark) applied to classification segments by position, not code,
// so any classification level configured in bayanat.classification_types renders sensibly.
const SEGMENT_COLORS = ["#81B4E1", "#6D7FC4", "#6058A0", "#4D3B8D", "#3A2B66", "#1F1740"];

export function CatalogPageClient({
  stats: initialStats, sources, glossaries, glossaryStats,
  cdeCoverage: initialCdeCoverage, classification: initialClassification,
  cdeMetadataQuality: initialCdeMetadataQuality, cdeDataQuality: initialCdeDataQuality, canEdit,
}: {
  stats: CatalogStats;
  sources: (DataSource & { schemas: DataSchema[] })[];
  glossaries: GlossaryRoot[];
  glossaryStats: GlossaryStats;
  cdeCoverage: CdeCoverage;
  classification: BusinessClassification;
  cdeMetadataQuality: CdeMetadataQuality;
  cdeDataQuality: CdeDataQuality;
  canEdit: boolean;
}) {
  const { t } = useLang();
  const c = t.catalog;
  const [dqConfigOpen, setDqConfigOpen] = useState(false);
  const [showNewTerm, setShowNewTerm] = useState(false);

  // Source filter — narrows the Data Assets tree below to any number of sources
  // (multi-select); "KSA · ..." reflects the current selection (empty = All
  // sources). Every analysis card below (stat tiles, CDEs Coverage, Data
  // Classification, Metadata Quality, Data Quality) re-fetches scoped to this
  // same selection via GET /api/catalog/stats — see the effect below.
  const [sourceFilterIds, setSourceFilterIds] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [analytics, setAnalytics] = useState({
    stats: initialStats, cdeCoverage: initialCdeCoverage, classification: initialClassification,
    cdeMetadataQuality: initialCdeMetadataQuality, cdeDataQuality: initialCdeDataQuality,
  });
  const { stats, cdeCoverage, classification, cdeMetadataQuality, cdeDataQuality } = analytics;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const idsParam = [...sourceFilterIds].join(",");
    fetch(`/api/catalog/stats${idsParam ? `?dataSourceIds=${idsParam}` : ""}`)
      .then((r) => r.json())
      .then(setAnalytics)
      .catch(() => {});
  }, [sourceFilterIds]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggleSourceFilter(id: number) {
    setSourceFilterIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const sourceFiltered = sourceFilterIds.size === 0 ? sources : sources.filter((s) => sourceFilterIds.has(s.dataSourceId));
  const scopeLabel = sourceFilterIds.size === 0
    ? "All sources"
    : sourceFilterIds.size === 1
    ? sources.find((s) => sourceFilterIds.has(s.dataSourceId))?.sourceName ?? "All sources"
    : `${sourceFilterIds.size} sources`;

  // Data Assets panel — search-by-name + sort, applied on top of the source filter.
  const [assetSearch, setAssetSearch] = useState("");
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSort, setAssetSort] = useState<"name" | "nameDesc" | "tables" | "schemas">("name");
  const [sortOpen, setSortOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setAssetSearchOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const q = assetSearch.trim().toLowerCase();
  const searchFiltered = q === "" ? sourceFiltered : sourceFiltered
    .map((s) => ({ ...s, schemas: s.schemas.filter((sc) => sc.schemaName.toLowerCase().includes(q)) }))
    .filter((s) => s.sourceName.toLowerCase().includes(q) || s.schemas.length > 0);

  const tableCount = (s: DataSource & { schemas: DataSchema[] }) => s.schemas.reduce((sum, sc) => sum + (sc.tableCount ?? 0), 0);
  const filteredSources = [...searchFiltered].sort((a, b) => {
    if (assetSort === "name") return a.sourceName.localeCompare(b.sourceName);
    if (assetSort === "nameDesc") return b.sourceName.localeCompare(a.sourceName);
    if (assetSort === "tables") return tableCount(b) - tableCount(a);
    return b.schemas.length - a.schemas.length;
  });

  const cdeCoveragePct = cdeCoverage.businessColumns > 0
    ? Math.round((cdeCoverage.cdeColumns / cdeCoverage.businessColumns) * 100) : 0;
  const classifiedPct = classification.total > 0
    ? Math.round((classification.classified / classification.total) * 100) : 0;
  const metadataCompositePct = Math.round(
    (cdeMetadataQuality.completeness + cdeMetadataQuality.accuracy + cdeMetadataQuality.consistency) / 3
  );

  return (
    <main className="px-8 py-7 pb-14">
      {/* Header + CDEs Coverage */}
      <div className="flex items-stretch gap-5 mb-6">
        <div className="card p-5 flex-[1.4] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold flex items-center gap-2.5">
                {c.pageTitle}
                <Tag>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  KSA · {scopeLabel}
                </Tag>
              </h1>
              <div className="flex items-center gap-2">
                <div className="relative" ref={filterRef}>
                  <button onClick={() => setFilterOpen((v) => !v)} className="btn btn-sm">
                    {c.filterBtn}{sourceFilterIds.size > 0 && ` (${sourceFilterIds.size})`}
                  </button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-line rounded-lg shadow-lg z-50 py-1">
                      <button
                        onClick={() => setSourceFilterIds(new Set())}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-canvas ${sourceFilterIds.size === 0 ? "text-brand-purple font-semibold" : "text-ink-soft"}`}
                      >
                        All sources
                      </button>
                      <div className="border-t border-line-soft my-1" />
                      <div className="max-h-64 overflow-y-auto">
                        {sources.map((s) => (
                          <label
                            key={s.dataSourceId}
                            className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-ink-soft hover:bg-canvas cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={sourceFilterIds.has(s.dataSourceId)}
                              onChange={() => toggleSourceFilter(s.dataSourceId)}
                              className="w-3.5 h-3.5 accent-brand-purple shrink-0"
                            />
                            <span className="truncate">{s.sourceName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Link href="/bulk-operations" className="btn btn-sm">{c.exportBtn}</Link>
                <AddAssetButton />
              </div>
            </div>
            <p className="text-ink-soft max-w-2xl">{c.pageDesc}</p>
          </div>
        </div>

        <div className="card p-5 flex-1 min-w-[260px]">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-bold">{c.cdesCoverage}</h3>
          </div>
          <div className="text-3xl font-extrabold text-brand-deep mb-1">{cdeCoveragePct}%</div>
          <div className="h-2 rounded-full bg-canvas overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-light to-brand-purple" style={{ width: `${cdeCoveragePct}%` }} />
          </div>
          <p className="text-[11px] text-muted mt-2">
            {fmtNumber(cdeCoverage.cdeColumns)} / {fmtNumber(cdeCoverage.businessColumns)} {c.cdesCovered}
          </p>
        </div>
      </div>

      {/* Coverage cards */}
      <section className="grid grid-cols-3 gap-5 mb-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="font-bold">{c.dataClassification}</h3>
          </div>
          <div className="text-3xl font-extrabold text-brand-deep mb-1">{classifiedPct}%</div>
          <p className="text-[11px] text-muted mb-3">
            {fmtNumber(classification.classified)} / {fmtNumber(classification.total)} {c.columnsClassifiedLabel}
          </p>
          {classification.classified > 0 ? (
            <>
              <div className="h-2 rounded-full bg-canvas overflow-hidden flex">
                {classification.segments.map((s, i) => (
                  <div
                    key={s.code}
                    style={{
                      width: `${(s.count / classification.classified) * 100}%`,
                      backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-3.5 mt-3 border-t border-line-soft">
                {classification.segments.map((s, i) => (
                  <div key={s.code} className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                    {s.name} · {Math.round((s.count / classification.classified) * 100)}%
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted italic pt-3.5 mt-3 border-t border-line-soft">{t.common.noData}</p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">{c.metadataQuality}</h3>
          </div>
          {cdeMetadataQuality.totalCdes > 0 ? (
            <div className="flex items-center gap-4">
              <Donut value={metadataCompositePct} label={c.score} size={120} strokeWidth={14} gradientId="g-meta" startColor="#6058A0" endColor="#4D4B8D" />
              <div className="flex-1 space-y-1.5">
                <Mini label={c.completeness} value={`${cdeMetadataQuality.completeness}%`} />
                <Mini label={c.accuracy}     value={`${cdeMetadataQuality.accuracy}%`} />
                <Mini label={c.consistency}  value={`${cdeMetadataQuality.consistency}%`} />
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted italic py-8">{c.noCdesYet}</p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold">{c.dataQuality}</h3>
            {canEdit && (
              <button onClick={() => setDqConfigOpen(true)} className="text-[11px] text-brand-purple hover:underline">
                {c.configureBtn}
              </button>
            )}
          </div>
          {cdeDataQuality.totalCdes > 0 ? (
            <div className="flex items-center gap-4">
              {cdeDataQuality.overallScore != null ? (
                <Donut
                  value={cdeDataQuality.overallScore}
                  label={c.score}
                  size={120}
                  strokeWidth={14}
                  gradientId="g-dq"
                  startColor="#81B4E1"
                  endColor="#7AA1D0"
                />
              ) : (
                <div
                  style={{ width: 120, height: 120 }}
                  className="shrink-0 rounded-full border-[14px] border-canvas grid place-items-center text-center"
                >
                  <span className="text-[11px] text-muted px-2">{c.noRulesYet}</span>
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                {cdeDataQuality.dimensions.map((d) => (
                  <Mini key={d.dimensionCode} label={d.label} value={d.score != null ? `${Math.round(d.score)}%` : c.noRulesYet} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted italic py-8">{c.noCdesYet}</p>
          )}
        </div>
      </section>

      {dqConfigOpen && (
        <CdeDqConfigModal
          dimensions={cdeDataQuality.dimensions.map((d) => ({
            dimensionCode: d.dimensionCode, label: d.label, weight: d.weight, isEnabled: d.isEnabled,
          }))}
          onClose={() => setDqConfigOpen(false)}
        />
      )}

      {/* Data Assets + Glossaries */}
      <section className="grid grid-cols-2 gap-5">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">{c.dataAssets}</h3>
            <div className="flex items-center gap-2">
              <div className="relative" ref={sortRef}>
                <button onClick={() => setSortOpen((v) => !v)} className="btn btn-sm">{c.sortBtn}</button>
                {sortOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-line rounded-lg shadow-lg z-50 py-1">
                    {([
                      ["name", "Name (A–Z)"], ["nameDesc", "Name (Z–A)"],
                      ["tables", "Most tables"], ["schemas", "Most schemas"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => { setAssetSort(value); setSortOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-canvas ${assetSort === value ? "text-brand-purple font-semibold" : "text-ink-soft"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={searchRef}>
                <button onClick={() => setAssetSearchOpen((v) => !v)} className="btn btn-sm">{c.filterBtn}</button>
                {assetSearchOpen && (
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-line rounded-lg shadow-lg z-50 p-2">
                    <input
                      autoFocus
                      value={assetSearch}
                      onChange={(e) => setAssetSearch(e.target.value)}
                      placeholder="Search source or schema name…"
                      className="w-full text-[13px] border border-line rounded-md px-2 py-1.5 outline-none focus:border-brand-purple"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
            {/* stats.* already comes back scoped to the source filter from
                GET /api/catalog/stats — only the client-only name search
                (server doesn't know about it) needs a client-side re-tally. */}
            <Big label={c.sources} value={q === "" ? stats.sources : filteredSources.length} />
            <Big label={c.records} value={stats.records} />
            <Big label={c.tables}  value={q === "" ? stats.tables : filteredSources.reduce((sum, s) => sum + tableCount(s), 0)} />
            <Big label={c.schemas} value={q === "" ? stats.schemas : filteredSources.reduce((sum, s) => sum + s.schemas.length, 0)} />
          </div>
          <div className="px-2 py-2">
            <AssetTree sources={filteredSources} canEdit={canEdit} />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">{c.glossaries}</h3>
            <button onClick={() => setShowNewTerm(true)} className="btn btn-sm">{c.newTerm}</button>
          </div>
          <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
            <Big label={c.terms}        value={glossaryStats.totalTerms} />
            <Big label={c.categories}   value={glossaries.length} />
            <Big label={c.linkedTerms}  value={glossaryStats.linkedTerms} />
            <Big label={c.linkedAssets} value={glossaryStats.linkedAssets} />
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

      {showNewTerm && (
        <AddAssetModal initialKind="BUSINESS_TERM" onClose={() => setShowNewTerm(false)} />
      )}
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
