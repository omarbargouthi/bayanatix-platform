"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import { objectTypeLabels, TYPE_COLORS } from "./LineageNode";
import type { ViewAnatomyResult, ViewQuery, ViewSelect, ViewSource, ViewJoin, ColumnRefOut } from "@/lib/lineage/view-anatomy";

type T = I18nStrings["viewAnatomy"];

// One colour per source table, used for its card and for every column chip that
// comes from it, so each output column can be traced back at a glance.
const PALETTE = [
  { border: "border-l-indigo-500", chip: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  { border: "border-l-teal-500", chip: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
  { border: "border-l-amber-500", chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  { border: "border-l-rose-500", chip: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  { border: "border-l-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  { border: "border-l-lime-600", chip: "bg-lime-50 text-lime-800 border-lime-200", dot: "bg-lime-600" },
  { border: "border-l-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
];
const NEUTRAL = { border: "border-l-slate-300", chip: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" };

const KIND_STYLE: Record<string, string> = {
  DIRECT: "bg-slate-100 text-slate-600", RENAMED: "bg-sky-100 text-sky-700", CAST: "bg-cyan-100 text-cyan-700",
  CALCULATED: "bg-violet-100 text-violet-700", AGGREGATE: "bg-amber-100 text-amber-800", WINDOW: "bg-orange-100 text-orange-700",
  CONDITIONAL: "bg-rose-100 text-rose-700", CONSTANT: "bg-lime-100 text-lime-800",
};

const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

// Join type as a small Venn diagram: which part of the two sides is kept.
function JoinGlyph({ type }: { type: ViewJoin["type"] }) {
  if (type === "CROSS") {
    return (
      <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden>
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={7 + c * 7} y={2 + r * 7} width="5" height="5" rx="1" className="fill-brand-purple/60" />))}
      </svg>
    );
  }
  const left = type === "LEFT" || type === "FULL", right = type === "RIGHT" || type === "FULL";
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden>
      <defs><clipPath id={`clip-${type}`}><circle cx="13" cy="11" r="9" /></clipPath></defs>
      <circle cx="13" cy="11" r="9" className={left ? "fill-brand-purple/60" : "fill-white"} />
      <circle cx="21" cy="11" r="9" className={right ? "fill-brand-purple/60" : "fill-white"} />
      <circle cx="21" cy="11" r="9" clipPath={`url(#clip-${type})`} className="fill-brand-purple" />
      <circle cx="13" cy="11" r="9" className="fill-none stroke-brand-purple" strokeWidth="1.2" />
      <circle cx="21" cy="11" r="9" className="fill-none stroke-brand-purple" strokeWidth="1.2" />
    </svg>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[12px] text-ink bg-canvas-soft border border-line-soft rounded px-1.5 py-0.5 break-words" dir="ltr">{children}</code>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-muted font-bold mb-2">{children}</div>;
}

function QueryBlock({ q, t, ty }: { q: ViewQuery; t: T; ty: Record<string, string> }) {
  return (
    <div className="space-y-5">
      {q.ctes.length > 0 && (
        <div>
          <SectionTitle>{t.steps}</SectionTitle>
          <div className="space-y-3">
            {q.ctes.map((c, i) => (
              <details key={c.name} className="border border-line rounded-lg" open={q.ctes.length <= 2}>
                <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold text-brand-deep">{fill(t.stepN, { n: i + 1, name: c.name })}</summary>
                <div className="px-4 pb-4"><QueryBlock q={c.query} t={t} ty={ty} /></div>
              </details>
            ))}
          </div>
          <div className="mt-4 text-[11px] uppercase tracking-wider text-muted font-bold">{t.finalResult}</div>
        </div>
      )}
      {q.kind === "SET_OP" ? <SetOpBlock q={q} t={t} ty={ty} /> : <SelectBlock q={q} t={t} ty={ty} />}
    </div>
  );
}

function SetOpBlock({ q, t, ty }: { q: Extract<ViewQuery, { kind: "SET_OP" }>; t: T; ty: Record<string, string> }) {
  const helpKey = q.op.replace(" ", "_") as keyof T["setOpHelp"];
  return (
    <div className="space-y-3">
      <div className="text-[13px] text-ink bg-brand-purple/5 border border-brand-purple/20 rounded-md px-3 py-2">
        <b>{fill(t.setOp, { n: q.branches.length, op: q.op })}</b>
        {t.setOpHelp[helpKey] && <span className="text-ink-soft"> — {t.setOpHelp[helpKey]}</span>}
      </div>
      {q.branches.map((b, i) => (
        <div key={i} className="border border-line rounded-lg p-4">
          <div className="text-[12px] font-bold text-brand-deep mb-3">{fill(t.partN, { n: i + 1 })}</div>
          <QueryBlock q={b} t={t} ty={ty} />
        </div>
      ))}
      {(q.orderBy.length > 0 || q.limit) && (
        <div className="text-[12px] text-ink-soft space-y-1">
          {q.orderBy.length > 0 && <div>{t.orderBy}: {q.orderBy.map((o) => <Code key={o}>{o}</Code>)}</div>}
          {q.limit && <div>{t.limit}: <Code>{q.limit}</Code></div>}
        </div>
      )}
    </div>
  );
}

function SelectBlock({ q, t, ty }: { q: ViewSelect; t: T; ty: Record<string, string> }) {
  const colorOf = new Map(q.sources.map((s, i) => [s.alias, PALETTE[i % PALETTE.length]]));
  const color = (alias: string | null) => (alias ? colorOf.get(alias) ?? NEUTRAL : NEUTRAL);
  const ref = (r: ColumnRefOut, key?: string | number) => (
    <span key={key} className={`inline-flex items-center gap-1 text-[11px] border rounded px-1.5 py-0.5 font-mono ${color(r.alias).chip}`} dir="ltr">
      {r.alias ? `${r.alias}.` : ""}{r.column}
    </span>
  );

  // Sources in join order: the first table, then each join with the table(s) it brings in.
  const byAlias = new Map(q.sources.map((s) => [s.alias, s]));
  const placed = new Set<string>();
  const steps: { join: ViewJoin | null; sources: ViewSource[] }[] = [];
  const firstAliases = q.joins[0]?.leftAliases ?? q.sources.map((s) => s.alias);
  steps.push({ join: null, sources: firstAliases.map((a) => byAlias.get(a)!).filter(Boolean) });
  firstAliases.forEach((a) => placed.add(a));
  for (const j of q.joins) {
    const fresh = j.rightAliases.filter((a) => !placed.has(a));
    fresh.forEach((a) => placed.add(a));
    steps.push({ join: j, sources: fresh.map((a) => byAlias.get(a)!).filter(Boolean) });
  }
  for (const s of q.sources) if (!placed.has(s.alias)) steps.push({ join: null, sources: [s] });

  return (
    <div className="space-y-5">
      {/* ── Built from ── */}
      <div>
        <SectionTitle>{t.builtFrom}</SectionTitle>
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={i}>
              {step.join && <JoinConnector j={step.join} t={t} />}
              <div className="space-y-2">
                {step.sources.map((src) => <SourceCard key={src.alias} src={src} c={color(src.alias)} t={t} ty={ty} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters / grouping ── */}
      {q.distinct && <div className="text-[12px] text-ink-soft">• {t.distinct}</div>}
      {q.filters.length > 0 && (
        <div>
          <SectionTitle>{t.filters}</SectionTitle>
          <ul className="space-y-1.5">{q.filters.map((f, i) => <li key={i} className="flex gap-2 items-start text-[12px]"><span className="text-brand-purple mt-0.5">▸</span><Code>{f}</Code></li>)}</ul>
        </div>
      )}
      {q.groupBy.length > 0 && (
        <div>
          <SectionTitle>{t.groupBy}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">{q.groupBy.map((g, i) => <Code key={i}>{g}</Code>)}</div>
        </div>
      )}
      {q.having.length > 0 && (
        <div>
          <SectionTitle>{t.having}</SectionTitle>
          <ul className="space-y-1.5">{q.having.map((h, i) => <li key={i} className="flex gap-2 items-start text-[12px]"><span className="text-brand-purple mt-0.5">▸</span><Code>{h}</Code></li>)}</ul>
        </div>
      )}
      {(q.orderBy.length > 0 || q.limit) && (
        <div className="text-[12px] text-ink-soft space-y-1">
          {q.orderBy.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{t.orderBy}: {q.orderBy.map((o, i) => <Code key={i}>{o}</Code>)}</div>}
          {q.limit && <div>{t.limit}: <Code>{q.limit}</Code></div>}
        </div>
      )}

      {/* ── Output columns ── */}
      <div>
        <SectionTitle>{fill(t.outputColumns, { n: q.columns.length })}</SectionTitle>
        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-canvas-soft">
              <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
                <th className="px-3 py-2 text-start">{t.colName}</th>
                <th className="px-3 py-2 text-start">{t.colKind}</th>
                <th className="px-3 py-2 text-start">{t.colFrom}</th>
                <th className="px-3 py-2 text-start">{t.colLogic}</th>
              </tr>
            </thead>
            <tbody>
              {q.columns.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-t border-line-soft align-top">
                  <td className="px-3 py-2 text-[13px] font-medium text-ink font-mono" dir="ltr">{c.name}</td>
                  <td className="px-3 py-2"><span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${KIND_STYLE[c.kind]}`}>{t.kinds[c.kind]}</span></td>
                  <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{c.sources.length ? c.sources.map((r, k) => ref(r, k)) : <span className="text-[11px] text-muted">—</span>}</div></td>
                  <td className="px-3 py-2 text-[12px]">{c.kind === "DIRECT" ? <span className="text-muted">—</span> : <Code>{c.expression}</Code>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.columns.some((c) => c.sources.some((r) => !r.alias)) && <p className="text-[11px] text-muted mt-1.5">{t.unresolved}: <span className={`inline-block w-2 h-2 rounded-full ${NEUTRAL.dot}`} /></p>}
      </div>
    </div>
  );
}

function JoinConnector({ j, t }: { j: ViewJoin; t: T }) {
  return (
    <div className="flex items-stretch gap-3 ps-4 my-1">
      <div className="w-px bg-line" />
      <div className={`flex-1 my-1.5 rounded-md px-3 py-2 ${j.implicit ? "border border-dashed border-line" : "bg-brand-purple/5 border border-brand-purple/20"}`}>
        <div className="flex items-center gap-2">
          <JoinGlyph type={j.type} />
          <span className="text-[12px] font-bold text-brand-deep">{t.joinTypes[j.type]}</span>
          <span className="text-[11px] text-ink-soft">{j.implicit ? t.implicitJoin : t.joinHelp[j.type]}</span>
        </div>
        {!j.implicit && (j.condition || j.using.length > 0 || j.natural) && (
          <div className="mt-1.5 text-[12px] flex flex-wrap items-center gap-1.5">
            <span className="text-muted">{j.natural ? t.natural : j.using.length ? t.using : t.on}:</span>
            {j.using.length > 0 && j.using.map((u) => <Code key={u}>{u}</Code>)}
            {j.condition && <Code>{j.condition}</Code>}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ src, c, t, ty }: { src: ViewSource; c: (typeof PALETTE)[number]; t: T; ty: Record<string, string> }) {
  const kindLabel = src.kind === "SUBQUERY" ? t.subquery : src.kind === "CTE" ? t.cte : src.kind === "FUNCTION" ? t.function : null;
  const title = [src.schema, src.name].filter(Boolean).join(".");
  return (
    <div className={`border border-line border-l-4 ${c.border} rounded-lg bg-white px-4 py-2.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[11px] font-mono font-bold border rounded px-1.5 ${c.chip}`} dir="ltr">{src.alias}</span>
        {src.entityId && src.schemaId
          ? <Link href={`/catalog/${src.schemaId}/tables/${src.entityId}`} className="text-[13px] font-semibold text-brand-purple hover:underline" dir="ltr">{title}</Link>
          : <span className="text-[13px] font-semibold text-ink" dir="ltr">{title}</span>}
        {src.objectTypeCode && <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${TYPE_COLORS[src.objectTypeCode] ?? ""}`}>{ty[src.objectTypeCode] ?? src.objectTypeCode}</span>}
        {kindLabel && <span className="text-[10px] font-semibold uppercase text-muted">{kindLabel}</span>}
        {src.kind === "TABLE" && !src.entityId && <span className="text-[10px] text-amber-700">{t.notInCatalog}</span>}
      </div>
      {src.usedColumns.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted me-1">{t.columnsUsed}:</span>
          {src.usedColumns.map((col) => <span key={col} className={`text-[11px] font-mono border rounded px-1.5 ${c.chip}`} dir="ltr">{col}</span>)}
        </div>
      )}
      {src.subquery && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-brand-purple">{t.subquery}</summary>
          <div className="mt-2 ps-3 border-s-2 border-line"><QueryBlock q={src.subquery} t={t} ty={ty} /></div>
        </details>
      )}
    </div>
  );
}

// Drawer: "How this view is built" for a VIEW / MATERIALIZED_VIEW entity.
export function ViewAnatomyPanel({ entityId, onClose }: { entityId: number; onClose: () => void }) {
  const { t } = useLang();
  const va = t.viewAnatomy;
  const ty = objectTypeLabels(t.lineage);
  const [data, setData] = useState<ViewAnatomyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"structure" | "sql">("structure");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/lineage/view-anatomy?entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : null)).then(setData).finally(() => setLoading(false));
  }, [entityId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-[920px] max-w-full h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-[15px] text-brand-deep">{va.title}</h2>
            {data && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[14px] font-semibold text-brand-purple" dir="auto">{data.view.name}</span>
                <span className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${TYPE_COLORS[data.view.objectTypeCode] ?? ""}`}>{ty[data.view.objectTypeCode]}</span>
                <span className="text-[11px] text-muted" dir="auto">{[data.view.sourceName, data.view.schemaName].filter(Boolean).join(" › ")}</span>
              </div>
            )}
            {data?.scannedAt && <div className="text-[11px] text-muted mt-0.5">{fill(va.scannedAt, { date: new Date(data.scannedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}</div>}
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        {data?.definition && (
          <div className="px-6 border-b border-line flex gap-1 shrink-0">
            {(["structure", "sql"] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} disabled={k === "structure" && !data.anatomy}
                className={`px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px ${tab === k ? "border-brand-purple text-brand-purple" : "border-transparent text-ink-soft hover:text-ink"} disabled:opacity-40`}>
                {k === "structure" ? va.tabStructure : va.tabSql}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto nice-scroll px-6 py-5">
          {loading && <div className="py-12 text-center text-sm text-muted">{va.loading}</div>}
          {!loading && data?.problem === "NO_DEFINITION" && <div className="text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">{va.noDefinition}</div>}
          {!loading && data?.problem === "PARSE_FAILED" && <div className="mb-4 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">{va.parseFailed}</div>}
          {!loading && data?.anatomy && tab === "structure" && <QueryBlock q={data.anatomy} t={va} ty={ty} />}
          {!loading && data?.definition && (tab === "sql" || !data.anatomy) && (
            <pre className="font-mono text-[12px] leading-relaxed text-ink bg-canvas-soft border border-line rounded-lg p-4 whitespace-pre-wrap" dir="ltr">{data.definition.trim()}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
