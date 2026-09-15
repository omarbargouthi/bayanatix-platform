"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { Donut } from "@/components/ui/Donut";
import { AssetTree } from "@/components/catalog/AssetTree";
import { AddAssetButton } from "@/components/catalog/AddAssetButton";
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
  stats, sources, glossaries, glossaryStats, cdeCoverage, classification, cdeMetadataQuality, cdeDataQuality, canEdit,
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

  // Source filter — narrows the Data Assets tree below to one source; "KSA · ..."
  // reflects whichever is currently selected (empty = All sources). The four
  // coverage/quality cards above stay catalog-wide regardless of this filter —
  // re-scoping those would mean per-source variants of getCdeCoverage() and
  // friends, out of scope for what was asked here.
  const [sourceFilterId, setSourceFilterId] = useState<number | "">("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredSources = sourceFilterId === "" ? sources : sources.filter((s) => s.dataSourceId === sourceFilterId);
  const scopeLabel = sourceFilterId === ""
    ? "All sources"
    : sources.find((s) => s.dataSourceId === sourceFilterId)?.sourceName ?? "All sources";

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
                  <button onClick={() => setFilterOpen((v) => !v)} className="btn btn-sm">{c.filterBtn}</button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-line rounded-lg shadow-lg z-50 py-1">
                      <button
                        onClick={() => { setSourceFilterId(""); setFilterOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-canvas ${sourceFilterId === "" ? "text-brand-purple font-semibold" : "text-ink-soft"}`}
                      >
                        All sources
                      </button>
                      <div className="border-t border-line-soft my-1" />
                      {sources.map((s) => (
                        <button
                          key={s.dataSourceId}
                          onClick={() => { setSourceFilterId(s.dataSourceId); setFilterOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-canvas truncate ${sourceFilterId === s.dataSourceId ? "text-brand-purple font-semibold" : "text-ink-soft"}`}
                        >
                          {s.sourceName}
                        </button>
                      ))}
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
              <button className="btn btn-sm">{c.sortBtn}</button>
              <button className="btn btn-sm">{c.filterBtn}</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2.5 px-5 py-3.5 border-b border-line-soft">
            <Big label={c.sources} value={sourceFilterId === "" ? stats.sources : filteredSources.length} />
            {/* Records has no per-schema breakdown in the `sources` prop to re-sum
                client-side when filtered — stays the catalog-wide total. */}
            <Big label={c.records} value={stats.records} />
            <Big label={c.tables}  value={sourceFilterId === "" ? stats.tables : filteredSources.reduce((sum, s) => sum + s.schemas.reduce((s2, sc) => s2 + (sc.tableCount ?? 0), 0), 0)} />
            <Big label={c.schemas} value={sourceFilterId === "" ? stats.schemas : filteredSources.reduce((sum, s) => sum + s.schemas.length, 0)} />
          </div>
          <div className="px-2 py-2">
            <AssetTree sources={filteredSources} canEdit={canEdit} />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
            <h3 className="font-bold">{c.glossaries}</h3>
            <button className="btn btn-sm">{c.newTerm}</button>
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
