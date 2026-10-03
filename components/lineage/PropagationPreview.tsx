"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

type TermRef = { id: number; name: string; isPii: boolean };
type ColRef = { columnId: number; columnName: string; entityId: number; entityName: string; schemaId: number | null; schemaName: string | null; hop: number };
type Field = "CLASSIFICATION" | "BUSINESS_TERM" | "DESCRIPTION" | "TAG" | "RETENTION";
export type Preview = {
  focus: { columnId: number; columnName: string; current: (TermRef & { inherited: boolean }) | null; after: (TermRef & { inherited: boolean }) | null }[];
  options: TermRef[];
  currentFlows: (ColRef & { term: TermRef })[];
  changes: (ColRef & { before: TermRef | null; after: TermRef | null })[];
  protectedColumns: (ColRef & { own: TermRef })[];
  newSuggestions: (ColRef & { term: TermRef })[];
  openSuggestions: (ColRef & { propagationId: number; field: Field; value: string | null })[];
};

const NO_CHANGE = "", REMOVE_OWN = "none";

// "Assess a change" › Metadata propagation: what flows downstream from the column
// (or table) today and what the planned change would do to it — the propagation
// engine's own rules run read-only (lib/lineage/propagation.ts previewPropagation).
export function PropagationPreview({
  assetType, assetId, removing, onPreview,
}: {
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES"; assetId: number; removing: boolean;
  // planned: the planned classification (glossary id or "none") when one is chosen
  onPreview?: (p: Preview | null, planned: string | null) => void;
}) {
  const { t } = useLang();
  const pp = t.propagationPreview;
  const isColumn = assetType === "DATA_ATTRIBUTES";
  const [planned, setPlanned] = useState(NO_CHANGE);
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setPlanned(NO_CHANGE); }, [assetType, assetId]);

  const scenario = removing ? "REMOVE" : isColumn && planned !== NO_CHANGE ? "RECLASSIFY" : "NONE";
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ assetType, assetId: String(assetId), scenario });
    if (scenario === "RECLASSIFY" && planned !== REMOVE_OWN) p.set("newTerm", planned);
    fetch(`/api/lineage/propagation/preview?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Preview | null) => { setData(d); onPreview?.(scenario === "NONE" ? null : d, scenario === "RECLASSIFY" ? planned : null); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, assetId, scenario, planned]);

  const term = (x: TermRef | null, inherited?: boolean) => x ? (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink" dir="auto">{x.name}</span>
      {x.isPii && <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1">{pp.pi}</span>}
      {inherited && <span className="text-[11px] text-muted">({pp.inherited})</span>}
    </span>
  ) : <span className="text-muted">{pp.none}</span>;

  const colLink = (c: ColRef) => (
    <span className="min-w-0 truncate" dir="auto">
      {c.schemaId
        ? <Link href={`/catalog/${c.schemaId}/tables/${c.entityId}`} className="text-brand-purple hover:underline">{c.entityName}.{c.columnName}</Link>
        : <>{c.entityName}.{c.columnName}</>}
    </span>
  );

  const list = (title: string, rows: ReactNode[], note?: string) => rows.length === 0 ? null : (
    <div>
      <div className="text-[12px] font-semibold text-ink mb-1">{title}</div>
      {note && <div className="text-[11px] text-muted mb-1">{note}</div>}
      <div className="border border-line rounded-md divide-y divide-line-soft max-h-48 overflow-y-auto nice-scroll">{rows}</div>
    </div>
  );
  const row = (key: string | number, c: ColRef, right: ReactNode) => (
    <div key={key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
      <div className="flex items-center gap-2 min-w-0">
        {colLink(c)}
        <span className="text-[10px] text-muted shrink-0">{pp.hop.replace("{n}", String(c.hop))}</span>
      </div>
      <div className="shrink-0 text-end">{right}</div>
    </div>
  );

  const focus = data?.focus[0];

  return (
    <div className="mx-5 mt-4 mb-1 border border-line rounded-lg p-4 space-y-3 bg-canvas-soft/40">
      <div>
        <div className="text-[13px] font-semibold text-brand-deep">{pp.title}</div>
        <p className="text-[11px] text-muted mt-0.5">{pp.desc}</p>
      </div>

      {isColumn && !removing && data && (
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="text-[12px]">
            <div className="text-[10px] font-semibold text-muted uppercase mb-1">{pp.current}</div>
            {term(focus?.current ?? null, focus?.current?.inherited)}
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted uppercase block mb-1">{pp.plannedClass}</label>
            <select className="input-field w-full text-[12px]" value={planned} onChange={(e) => setPlanned(e.target.value)}>
              <option value={NO_CHANGE}>{pp.noChange}</option>
              <option value={REMOVE_OWN}>{pp.removeClass}</option>
              {data.options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isPii ? ` (${pp.pi})` : ""}</option>)}
            </select>
          </div>
          {scenario === "RECLASSIFY" && (
            <div className="col-span-2 text-[12px]">
              <span className="text-[10px] font-semibold text-muted uppercase me-2">{pp.after}</span>
              {term(focus?.after ?? null, focus?.after?.inherited)}
            </div>
          )}
        </div>
      )}
      {!isColumn && data && <p className="text-[11px] text-muted">{pp.tableNote.replace("{n}", String(data.focus.length))}</p>}

      {loading && <div className="text-[12px] text-muted">{pp.loading}</div>}
      {!loading && data && (
        <div className="space-y-3">
          {scenario === "NONE" ? (
            data.currentFlows.length === 0
              ? <div className="text-[12px] text-muted">{pp.noFlows}</div>
              : list(pp.flowsTitle.replace("{n}", String(data.currentFlows.length)),
                  data.currentFlows.map((r) => row(r.columnId, r, term(r.term))))
          ) : (
            data.changes.length === 0
              ? <div className="text-[12px] text-emerald-700">{pp.noChanges}</div>
              : list(pp.changesTitle.replace("{n}", String(data.changes.length)),
                  data.changes.map((r) => row(r.columnId, r, <span className="inline-flex items-center gap-1.5">{term(r.before)}<span className="text-muted">→</span>{term(r.after)}</span>)))
          )}
          {list(pp.protectedTitle.replace("{n}", String(data.protectedColumns.length)),
            data.protectedColumns.map((r) => row(r.columnId, r, term(r.own))))}
          {list(pp.newSuggTitle.replace("{n}", String(data.newSuggestions.length)),
            data.newSuggestions.map((r) => row(r.columnId, r, term(r.term))))}
          {list(pp.openTitle.replace("{n}", String(data.openSuggestions.length)),
            data.openSuggestions.map((r) => row(r.propagationId, r,
              <span className="text-ink-soft"><span className="text-muted">{pp.fields[r.field]}:</span> <span dir="auto" className="inline-block max-w-[220px] truncate align-bottom">{r.value ?? ""}</span></span>)),
            removing ? pp.openRemoveNote : undefined)}
        </div>
      )}
    </div>
  );
}
