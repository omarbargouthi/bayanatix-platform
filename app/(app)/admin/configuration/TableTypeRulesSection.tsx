"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CATEGORY_PRIORITY, DEFAULT_TABLE_TYPE_CONFIG,
  type CategoryCode, type TableTypeConfig, type TableTypeLimits, type TableTypeWeights,
} from "@/lib/table-type-rules";

// Configuration > Table Type Rules (db/168): the keywords, points, size limits and
// confidence gaps a crawl uses to suggest a table's type. Each field shows its default;
// "Preview" scores the tables already in the catalog with the rules on screen.

const TYPE_LABEL: Record<CategoryCode, string> = {
  MASTER: "Master", TRANSACTIONAL: "Transactional", REFERENCE: "Lookup / Reference", SETUP: "Setup", SYSTEM: "System",
};
const TYPE_ORDER: CategoryCode[] = ["MASTER", "TRANSACTIONAL", "REFERENCE", "SETUP", "SYSTEM"];

const WEIGHTS: { key: keyof TableTypeWeights; label: string; to: string; note: string }[] = [
  { key: "nameKeyword",       label: "Table name contains a keyword",         to: "the keyword's type", note: "Once per type, however many of its keywords match." },
  { key: "systemPrefix",      label: "System naming",                         to: "System",        note: "Schema starts with sys, pg_ or information_schema, or the table starts with sys_ or pg_." },
  { key: "timestampColumn",   label: "Has a date or time column",             to: "Transactional", note: "A column ending in _at, _on, _date, _time, or starting with created, updated, modified, date, time." },
  { key: "manyKeyColumns",    label: "Two or more key columns",               to: "Transactional", note: "Columns ending in _id or _fk." },
  { key: "oneKeyColumn",      label: "Exactly one key column",                to: "Transactional", note: "Used instead of the line above when there is only one." },
  { key: "largeTable",        label: "Large table",                           to: "Transactional", note: "More rows than the “large table” limit below." },
  { key: "smallWithCodeDesc", label: "Small table with a code and a name",    to: "Reference",     note: "Within the “small table” limits, with a code column and a name / description / label / title column." },
  { key: "smallTable",        label: "Small table without that pair",         to: "Reference",     note: "Used instead of the line above." },
  { key: "wideEntity",        label: "Wide table describing one thing",       to: "Master",        note: "At least the “wide table” number of columns, no code-and-name pair, at most one key column." },
  { key: "masterDefault",     label: "Default",                               to: "Master",        note: "Always added, so Master is suggested when nothing else stands out." },
];
const LIMITS: { key: keyof TableTypeLimits; label: string; unit: string }[] = [
  { key: "largeRows",       label: "Large table: more than",        unit: "rows" },
  { key: "smallMaxColumns", label: "Small table: at most",          unit: "columns" },
  { key: "smallMaxRows",    label: "Small table: fewer than",       unit: "rows" },
  { key: "wideMinColumns",  label: "Wide table: at least",          unit: "columns" },
];

type Change = { entityId: number; schema: string; table: string; fromCode: string | null; fromConfidence: string | null; toCode: CategoryCode; toConfidence: string };
type Preview = { scored: number; typeChanged: number; confidenceChanged: number; changes: Change[]; applied: boolean };

const clone = (c: TableTypeConfig): TableTypeConfig => JSON.parse(JSON.stringify(c));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function DefaultHint({ value, def }: { value: number; def: number }) {
  const changed = Number(value) !== def;
  return <div className={`text-[10px] mt-0.5 ${changed ? "text-amber-700 font-semibold" : "text-muted"}`}>Default {def}{changed ? " · changed" : ""}</div>;
}

export function TableTypeRulesSection() {
  const [saved, setSaved] = useState<TableTypeConfig | null>(null);
  const [cfg, setCfg] = useState<TableTypeConfig | null>(null);
  // Keywords are edited as free text and split on save, so typing a comma does not jump the cursor.
  const [kwText, setKwText] = useState<Record<CategoryCode, string>>({ MASTER: "", TRANSACTIONAL: "", REFERENCE: "", SETUP: "", SYSTEM: "" });
  const [busy, setBusy] = useState<"" | "save" | "preview" | "apply">("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const show = useCallback((c: TableTypeConfig) => {
    setCfg(clone(c));
    setKwText(Object.fromEntries(CATEGORY_PRIORITY.map((k) => [k, c.keywords[k].join(", ")])) as Record<CategoryCode, string>);
  }, []);

  useEffect(() => {
    fetch("/api/admin/table-type-rules").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) { setError("The rules could not be loaded."); return; }
      setSaved(d.config); show(d.config);
    });
  }, [show]);

  if (!cfg || !saved) return <div className="text-sm text-muted">{error ?? "Loading…"}</div>;

  const splitKw = (text: string) => Array.from(new Set(text.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean)));
  // What is on screen, with the keyword boxes folded in.
  const current = (): TableTypeConfig => ({ ...cfg, keywords: Object.fromEntries(CATEGORY_PRIORITY.map((k) => [k, splitKw(kwText[k])])) as Record<CategoryCode, string[]> });
  const dirty = !same(current(), saved);
  const isDefault = same(current(), DEFAULT_TABLE_TYPE_CONFIG);

  const setWeight = (key: keyof TableTypeWeights, v: string) => setCfg({ ...cfg, weights: { ...cfg.weights, [key]: v === "" ? 0 : Number(v) } });
  const setLimit = (key: keyof TableTypeLimits, v: string) => setCfg({ ...cfg, limits: { ...cfg.limits, [key]: v === "" ? 0 : Number(v) } });
  const setGap = (key: "highGap" | "mediumGap", v: string) => setCfg({ ...cfg, confidence: { ...cfg.confidence, [key]: v === "" ? 0 : Number(v) } });

  async function call(method: "PUT" | "POST", body: unknown) {
    const r = await fetch("/api/admin/table-type-rules", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "The request failed.");
    return d;
  }
  async function save() {
    setBusy("save"); setError(null); setNote(null);
    try {
      const d = await call("PUT", { config: current() });
      setSaved(d.config); show(d.config); setPreview(null);
      setNote("Saved. The rules apply from the next crawl; use “Apply to existing tables” to re-score the catalog now.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function runPreview() {
    setBusy("preview"); setError(null); setNote(null);
    try { setPreview(await call("POST", { config: current(), apply: false })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function apply() {
    if (!confirm("Re-score every table whose type has not been confirmed by a steward, using the saved rules? Confirmed types are not touched.")) return;
    setBusy("apply"); setError(null); setNote(null);
    try {
      const d: Preview = await call("POST", { apply: true });
      setPreview(d);
      setNote(`Applied: ${d.typeChanged} table type${d.typeChanged === 1 ? "" : "s"} changed, ${d.confidenceChanged} confidence level${d.confidenceChanged === 1 ? "" : "s"} updated.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  const num = "w-20 border border-line rounded-md px-2 py-1 text-[13px] text-ink bg-white text-end focus:outline-none focus:border-brand-purple";
  const card = "rounded-lg border border-line bg-white px-5 py-4";
  const D = DEFAULT_TABLE_TYPE_CONFIG;

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink">Table Type Rules</h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          During a crawl every table is given a suggested type from its name, its column names and its row count. Each type
          collects points from the signals below; the type with the most points is suggested, and the confidence is how far it
          is ahead of the second. A type confirmed by a steward, or read from the source, is never changed by these rules.
        </p>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      {note && <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{note}</div>}

      <div className={card}>
        <div className="text-sm font-bold text-ink">Keywords in the table name</div>
        <p className="text-[11px] text-muted mt-0.5 mb-3">
          Separate with commas. A keyword matches anywhere in the name and ignores case, so “role” also matches user_roles.
        </p>
        <div className="space-y-3">
          {TYPE_ORDER.map((code) => {
            const changed = !same(splitKw(kwText[code]), D.keywords[code]);
            return (
              <div key={code} className="grid grid-cols-[150px_1fr] gap-3 items-start">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{TYPE_LABEL[code]}</div>
                  <div className={`text-[10px] ${changed ? "text-amber-700 font-semibold" : "text-muted"}`}>
                    {splitKw(kwText[code]).length} keywords{changed ? " · changed" : ""}
                  </div>
                  {changed && (
                    <button onClick={() => setKwText({ ...kwText, [code]: D.keywords[code].join(", ") })} className="text-[10px] text-brand-purple hover:underline">Use default list</button>
                  )}
                </div>
                <textarea rows={2} dir="ltr" value={kwText[code]} onChange={(e) => setKwText({ ...kwText, [code]: e.target.value })}
                  className="w-full border border-line rounded-md px-2.5 py-1.5 text-[13px] font-mono text-ink bg-white focus:outline-none focus:border-brand-purple resize-y" />
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-3">When two types end with the same points, the order System, Setup, Reference, Transactional, Master decides.</p>
      </div>

      <div className={`${card} mt-4`}>
        <div className="text-sm font-bold text-ink mb-2">Points per signal</div>
        <div className="divide-y divide-line-soft">
          {WEIGHTS.map((w) => (
            <div key={w.key} className="grid grid-cols-[1fr_130px_90px] gap-3 items-start py-2.5">
              <div>
                <div className="text-[13px] font-medium text-ink">{w.label}</div>
                <div className="text-[11px] text-muted leading-snug">{w.note}</div>
              </div>
              <div className="text-[12px] text-ink-soft pt-1">→ {w.to}</div>
              <div>
                <input type="number" min={0} max={20} step={1} className={num} value={cfg.weights[w.key]} onChange={(e) => setWeight(w.key, e.target.value)} />
                <DefaultHint value={cfg.weights[w.key]} def={D.weights[w.key]} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className={card}>
          <div className="text-sm font-bold text-ink mb-2">Size limits</div>
          <div className="space-y-2.5">
            {LIMITS.map((l) => (
              <div key={l.key} className="flex items-start gap-2">
                <div className="flex-1 text-[13px] text-ink pt-1">{l.label}</div>
                <div>
                  <input type="number" min={1} step={1} className={`${num} w-24`} value={cfg.limits[l.key]} onChange={(e) => setLimit(l.key, e.target.value)} />
                  <DefaultHint value={cfg.limits[l.key]} def={D.limits[l.key]} />
                </div>
                <div className="text-[12px] text-muted pt-1 w-14">{l.unit}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <div className="text-sm font-bold text-ink">Confidence</div>
          <p className="text-[11px] text-muted mt-0.5 mb-3">The lead of the suggested type over the second, in points. Below the Medium lead the confidence is Low.</p>
          <div className="space-y-2.5">
            {([["highGap", "High: a lead of at least"], ["mediumGap", "Medium: a lead of at least"]] as const).map(([key, label]) => (
              <div key={key} className="flex items-start gap-2">
                <div className="flex-1 text-[13px] text-ink pt-1">{label}</div>
                <div>
                  <input type="number" min={0} max={40} step={1} className={num} value={cfg.confidence[key]} onChange={(e) => setGap(key, e.target.value)} />
                  <DefaultHint value={cfg.confidence[key]} def={D.confidence[key]} />
                </div>
                <div className="text-[12px] text-muted pt-1 w-14">points</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-5 flex-wrap">
        <button onClick={save} disabled={!dirty || busy !== ""} className="btn btn-primary btn-sm disabled:opacity-50">{busy === "save" ? "Saving…" : "Save rules"}</button>
        <button onClick={runPreview} disabled={busy !== ""} className="btn btn-sm">{busy === "preview" ? "Scoring…" : "Preview on existing tables"}</button>
        <button onClick={apply} disabled={dirty || busy !== ""} title={dirty ? "Save the rules first" : undefined} className="btn btn-sm disabled:opacity-50">{busy === "apply" ? "Applying…" : "Apply to existing tables"}</button>
        <span className="flex-1" />
        {dirty && <button onClick={() => { show(saved); setPreview(null); }} disabled={busy !== ""} className="text-[12px] text-muted hover:text-ink">Discard changes</button>}
        <button onClick={() => { show(DEFAULT_TABLE_TYPE_CONFIG); setPreview(null); }} disabled={isDefault || busy !== ""} className="text-[12px] text-brand-purple font-medium hover:underline disabled:opacity-40 disabled:no-underline">Reset to defaults</button>
      </div>
      {dirty && <p className="text-[11px] text-amber-700 mt-2">There are unsaved changes. The preview uses what is on screen; a crawl uses what is saved.</p>}

      {preview && (
        <div className={`${card} mt-4`}>
          <div className="text-sm font-bold text-ink">{preview.applied ? "Applied to existing tables" : "Preview"}</div>
          <p className="text-[12px] text-ink-soft mt-1">
            {preview.scored} unconfirmed table{preview.scored === 1 ? "" : "s"} scored: <strong>{preview.typeChanged}</strong> {preview.applied ? "changed type" : "would change type"},
            {" "}{preview.confidenceChanged} {preview.applied ? "changed" : "would change"} confidence only.
          </p>
          {preview.changes.length > 0 && (
            <div className="mt-3 rounded-md border border-line-soft overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 px-3 py-2 bg-canvas-soft text-[10px] uppercase tracking-wider text-muted font-bold">
                <div>Table</div><div>{preview.applied ? "Was" : "Now"}</div><div>{preview.applied ? "Now" : "With these rules"}</div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-line-soft">
                {preview.changes.map((c) => (
                  <div key={c.entityId} className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 px-3 py-1.5 text-[12px]">
                    <div className="font-mono text-ink truncate" dir="ltr" title={`${c.schema}.${c.table}`}>{c.schema}.{c.table}</div>
                    <div className="text-ink-soft">{c.fromCode ? TYPE_LABEL[c.fromCode as CategoryCode] ?? c.fromCode : "—"}{c.fromConfidence ? ` · ${c.fromConfidence.toLowerCase()}` : ""}</div>
                    <div className="text-ink font-medium">{TYPE_LABEL[c.toCode]} · {c.toConfidence.toLowerCase()}</div>
                  </div>
                ))}
              </div>
              {preview.typeChanged > preview.changes.length && <div className="px-3 py-1.5 text-[11px] text-muted bg-canvas-soft">Showing the first {preview.changes.length} of {preview.typeChanged}.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
