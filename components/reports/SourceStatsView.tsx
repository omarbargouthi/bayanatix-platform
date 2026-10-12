"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Stars } from "@/components/catalog/DomainCard";
import { useLang } from "@/lib/lang-context";
import type { SourceStats, TopAssets, TopAsset, Slice, SourceLite, StewardLite } from "@/lib/reports/source-stats";

// Source system statistics as shown on Reports › Source Systems and on the Dashboard:
// the counts, the breakdowns (each a ranked bar list in one colour — the bars compare
// sizes, the text beside them carries the name and the number), certification, ratings
// and the four asset lists. Both pages render this one component, so they cannot differ.

const TIER_STYLE: Record<string, string> = {
  GOLD:   "bg-amber-100 text-amber-800 border-amber-300",
  SILVER: "bg-slate-100 text-slate-700 border-slate-300",
  BRONZE: "bg-orange-100 text-orange-800 border-orange-300",
};
const TIERS = ["GOLD", "SILVER", "BRONZE"];

/** The filter row: source, and — for those who see every source — steward. Filters live in the address (?source=&steward=). */
export function SourceStatsFilters({ sources, stewards, sourceId, stewardId, ownByDefault = false, allChosen = false }: {
  sources: SourceLite[]; stewards: StewardLite[] | null; sourceId: number | null; stewardId: string | null;
  /** Dashboard: with nothing chosen the page shows the user's own sources, and "all" is a choice (?source=all). */
  ownByDefault?: boolean; allChosen?: boolean;
}) {
  const s = useLang().t.sourceStats;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function set(key: "source" | "steward", value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    // A steward's sources differ from the current pick, so the source choice starts over.
    if (key === "steward") next.delete("source");
    router.push(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select aria-label={s.filterSource} className="field w-auto max-w-[260px]" value={sourceId ?? (allChosen ? "all" : "")} onChange={(e) => set("source", e.target.value)}>
        {/* The empty choice is "everything in view": the user's own sources, a chosen steward's, or all of them. */}
        <option value="">{!stewards || (ownByDefault && !stewardId) ? s.allMySources : stewardId ? s.allStewardSources : s.allSources}</option>
        {stewards && ownByDefault && !stewardId && <option value="all">{s.allSources}</option>}
        {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {stewards && (
        <select aria-label={s.filterSteward} className="field w-auto max-w-[240px]" value={stewardId ?? ""} onChange={(e) => set("steward", e.target.value)}>
          <option value="">{s.allStewards}</option>
          {stewards.map((x) => <option key={x.userId} value={x.userId}>{x.fullName}</option>)}
        </select>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-extrabold text-brand-deep tabular-nums">{value.toLocaleString("en-US")}</div>
      <div className="text-[12px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {note && <span className="text-[11px] text-muted text-end">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** A ranked list of bars. The "not set" slice (code null) is drawn muted and listed last. */
function BarList({ slices, emptyLabel, unsetLabel }: { slices: Slice[]; emptyLabel: string; unsetLabel: string }) {
  const total = slices.reduce((n, x) => n + x.value, 0);
  const max = Math.max(1, ...slices.map((x) => x.value));
  if (total === 0) return <p className="text-[12px] text-muted italic">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {slices.map((x) => {
        const pct = Math.round((x.value / total) * 100);
        return (
          <li key={x.code ?? "∅"} title={`${x.code == null ? unsetLabel : x.label}: ${x.value.toLocaleString("en-US")} (${pct}%)`}>
            <div className="flex items-baseline justify-between gap-3 text-[12px] mb-1">
              <span className={`truncate ${x.code == null ? "text-muted italic" : "text-ink"}`}>{x.code == null ? unsetLabel : x.label}</span>
              <span className="text-ink-soft tabular-nums shrink-0">{x.value.toLocaleString("en-US")} <span className="text-muted">· {pct}%</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-canvas overflow-hidden">
              <div className={`h-full rounded-full ${x.code == null ? "bg-line" : "bg-brand-purple"}`} style={{ width: `${Math.max(2, (x.value / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AssetList({ title, note, rows, emptyLabel, render }: {
  title: string; note?: string; rows: TopAsset[]; emptyLabel: string; render: (a: TopAsset) => React.ReactNode;
}) {
  return (
    <Panel title={title} note={note}>
      {rows.length === 0 ? <p className="text-[12px] text-muted italic">{emptyLabel}</p> : (
        <ol className="divide-y divide-line-soft -my-1.5">
          {rows.map((a, i) => (
            <li key={a.entityId} className="flex items-center gap-3 py-1.5">
              <span className="w-4 text-[11px] text-muted tabular-nums shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/catalog/${a.schemaId}/tables/${a.entityId}`} className="text-[13px] font-semibold text-brand-deep hover:text-brand-purple hover:underline truncate block" dir="auto">{a.name}</Link>
                <div className="text-[11px] text-muted truncate" dir="ltr">{a.sourceName} · {a.schemaName}</div>
              </div>
              <div className="shrink-0 text-end">{render(a)}</div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function SourceStatsView({ stats, top, emptyText }: { stats: SourceStats; top: TopAssets; emptyText?: string }) {
  const s = useLang().t.sourceStats;
  const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const classified = stats.classification.filter((x) => x.code != null).reduce((n, x) => n + x.value, 0);
  const certCount = (dimension: "METADATA" | "DATA", tier: string) => stats.certification.find((c) => c.dimension === dimension && c.tier === tier)?.value ?? 0;
  const maxRating = Math.max(1, ...stats.ratings.distribution.map((d) => d.value));
  const count = (text: string, n: number) => text.replace("{n}", n.toLocaleString("en-US"));
  const rated = (a: TopAsset) => (
    <>
      <div className="flex items-center justify-end gap-1.5"><Stars value={a.value} color="#D97706" /><span className="text-[12px] font-bold text-ink tabular-nums">{a.value.toFixed(2)}</span></div>
      <div className="text-[10px] text-muted">{count(s.ratingsCount, a.detail)}</div>
    </>
  );

  if (stats.counts.sources === 0) return <div className="card p-8 text-center text-sm text-muted">{emptyText ?? s.noSources}</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label={s.countSources} value={stats.counts.sources} />
        <Tile label={s.countSchemas} value={stats.counts.schemas} />
        <Tile label={s.countObjects} value={stats.counts.objects} />
        <Tile label={s.countColumns} value={stats.counts.columns} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <Panel title={s.sourceTypes}><BarList slices={stats.sourceTypes} emptyLabel={s.nothingYet} unsetLabel={s.notSet} /></Panel>
        <Panel title={s.objectTypes}><BarList slices={stats.objectTypes} emptyLabel={s.nothingYet} unsetLabel={s.notSet} /></Panel>
        <Panel title={s.tableTypes}><BarList slices={stats.tableTypes} emptyLabel={s.nothingYet} unsetLabel={s.notClassified} /></Panel>
        <Panel title={s.columnTypes}><BarList slices={stats.columnTypes} emptyLabel={s.nothingYet} unsetLabel={s.notClassified} /></Panel>
        <Panel title={s.classification} note={s.classifiedPct.replace("{pct}", String(pctOf(classified, stats.counts.columns)))}>
          <BarList slices={stats.classification} emptyLabel={s.nothingYet} unsetLabel={s.notClassified} />
        </Panel>

        <Panel title={s.certification} note={s.certifiedPct.replace("{pct}", String(pctOf(stats.certifiedObjects, stats.counts.objects)))}>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted">
                <th className="text-start font-normal pb-1.5" />
                {TIERS.map((tier) => (
                  <th key={tier} className="pb-1.5 font-normal"><span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${TIER_STYLE[tier]}`}>{s.tiers[tier as "GOLD" | "SILVER" | "BRONZE"]}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["METADATA", "DATA"] as const).map((dimension) => (
                <tr key={dimension} className="border-t border-line-soft">
                  <td className="py-2 text-ink">{dimension === "METADATA" ? s.certMetadata : s.certData}</td>
                  {TIERS.map((tier) => <td key={tier} className="py-2 text-center font-bold text-ink tabular-nums">{certCount(dimension, tier)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted mt-2">{s.certNote.replace("{certified}", String(stats.certifiedObjects)).replace("{total}", stats.counts.objects.toLocaleString("en-US"))}</p>
        </Panel>

        <Panel title={s.ratings} note={count(s.ratedObjects, stats.ratings.ratedObjects)}>
          {stats.ratings.ratingCount === 0 ? <p className="text-[12px] text-muted italic">{s.noRatings}</p> : (
            <div className="flex items-center gap-5">
              <div className="shrink-0 text-center">
                <div className="text-3xl font-extrabold text-brand-deep tabular-nums">{(stats.ratings.average ?? 0).toFixed(2)}</div>
                <div className="flex justify-center my-1"><Stars value={stats.ratings.average ?? 0} color="#D97706" size={14} /></div>
                <div className="text-[11px] text-muted">{count(s.ratingsCount, stats.ratings.ratingCount)}</div>
              </div>
              <ul className="flex-1 space-y-1">
                {stats.ratings.distribution.map((d) => (
                  <li key={d.stars} className="flex items-center gap-2 text-[11px]" title={`${d.stars}★: ${d.value}`}>
                    <span className="w-6 text-ink-soft tabular-nums">{d.stars}★</span>
                    <div className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden"><div className="h-full rounded-full bg-brand-purple" style={{ width: `${d.value === 0 ? 0 : Math.max(4, (d.value / maxRating) * 100)}%` }} /></div>
                    <span className="w-5 text-end text-muted tabular-nums">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AssetList title={s.mostUsed} note={s.mostUsedNote} rows={top.mostUsed} emptyLabel={s.noActivity}
          render={(a) => (<><div className="text-[13px] font-bold text-ink tabular-nums">{count(s.views, a.value)}</div><div className="text-[10px] text-muted">{count(s.users, a.detail)}</div></>)} />
        <AssetList title={s.mostSearched} note={s.mostSearchedNote} rows={top.mostSearched} emptyLabel={s.noActivity}
          render={(a) => (<><div className="text-[13px] font-bold text-ink tabular-nums">{count(s.searches, a.value)}</div><div className="text-[10px] text-muted">{count(s.users, a.detail)}</div></>)} />
        <AssetList title={s.highestRated} rows={top.highestRated} emptyLabel={s.noRatings} render={rated} />
        <AssetList title={s.lowestRated} rows={top.lowestRated} emptyLabel={s.noRatings} render={rated} />
      </div>
    </div>
  );
}
