"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_COLUMN_TYPE_CONFIG,
  type ColumnTypeConfig, type PatternGroup, type RuleKey,
} from "@/lib/column-classifier";

// Configuration > Column Type Rules (db/169): the name patterns, surrogate-key hints,
// confidence per rule, modifiers and confidence bands a classification run uses to
// suggest whether a column is Business or Technical. Each value shows its default;
// "Preview" scores the columns already in the catalog with the rules on screen.

type Pattern = { patternId: number; group: PatternGroup; regex: string; dataSourceId: number | null; sourceName: string | null; enabled: boolean; notes: string | null };

const GROUPS: { code: PatternGroup; label: string; note: string }[] = [
  { code: "AUDIT_COLUMN",  label: "Audit / housekeeping column", note: "Created / updated stamps, load and ETL fields. Always Technical (rule 1)." },
  { code: "SURROGATE_KEY", label: "Surrogate key",               note: "A generated key with no business meaning. Used by rules 2, 3, 4 and 10." },
  { code: "NATURAL_ID",    label: "Natural identifier",          note: "A number or code the business itself uses. Business (rule 4), unless it also looks like a surrogate key." },
  { code: "LOOKUP_VALUE",  label: "Lookup value",                note: "The descriptive column of a lookup table. Business (rule 5)." },
  { code: "EXCLUDE",       label: "Steward exception",           note: "A name a steward decided is Technical whatever it looks like. Checked before every rule (rule 0)." },
];

// The decision list, in the fixed order it is tried. The first rule that fits decides.
const RULES: { key: RuleKey; no: string; decision: "Business" | "Technical"; when: string }[] = [
  { key: "R0",  no: "0",  decision: "Technical", when: "The name matches a steward exception pattern." },
  { key: "R1",  no: "1",  decision: "Technical", when: "The name matches an audit / housekeeping pattern." },
  { key: "R2",  no: "2",  decision: "Technical", when: "The table’s only primary key column, and it looks like a surrogate key (name pattern, data type or default value)." },
  { key: "R3",  no: "3",  decision: "Technical", when: "A foreign key pointing at a surrogate primary key." },
  { key: "R4",  no: "4",  decision: "Business",  when: "The name matches a natural identifier pattern and not a surrogate key pattern." },
  { key: "R5",  no: "5",  decision: "Business",  when: "A non-key column of a lookup table that Master or Transactional tables refer to, matching a lookup value pattern (or the table has no primary key)." },
  { key: "R6",  no: "6",  decision: "Technical", when: "A key column (primary or foreign) of a lookup table." },
  { key: "R7_REFERENCED",   no: "7a", decision: "Business", when: "Any other non-key column of a lookup table that other tables refer to." },
  { key: "R7_UNREFERENCED", no: "7b", decision: "Business", when: "Any other non-key column of a lookup table nothing refers to." },
  { key: "R8",  no: "8",  decision: "Technical", when: "The table’s type is Setup or System." },
  { key: "R9",  no: "9",  decision: "Business",  when: "A non-key column of a Master or Transactional table." },
  { key: "R10", no: "10", decision: "Business",  when: "Part of a primary key made of several columns, not looking like a surrogate key." },
  { key: "R11", no: "11", decision: "Business",  when: "Nothing above fits (for example the table has no type yet)." },
];

const MODIFIERS: { key: keyof ColumnTypeConfig["modifiers"]; label: string; note: string }[] = [
  { key: "nameInferredFactor", label: "Relationship guessed from names: multiply by", note: "Applies to rules 3, 5 and 6 when the foreign key was not declared at the source but inferred from column names." },
  { key: "noCategoryCap",      label: "Table has no type: confidence at most",        note: "Whatever rule decided, the confidence is capped until the table has a table type." },
  { key: "glossaryFloor",      label: "Matches a glossary term: confidence at least", note: "The column or friendly name equals a business term or alias. The column is then always Business." },
  { key: "governedFloor",      label: "Already governed: confidence at least",        note: "The column has active data quality rules or a classification term. The column is then always Business." },
];

type Change = { attributeId: number; source: string; table: string; column: string; fromClass: string; fromBand: string; toClass: string; toConfidence: number; toBand: string; rule: string };
type Preview = { evaluated: number; suggestionChanged: number; bandChanged: number; confirmedDisagree: number; neverScored: number; changes: Change[]; applied: boolean };

const clone = (c: ColumnTypeConfig): ColumnTypeConfig => JSON.parse(JSON.stringify(c));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const cls = (c: string) => (c === "BUSINESS" ? "Business" : c === "TECHNICAL" ? "Technical" : "—");

function DefaultHint({ value, def }: { value: number; def: number }) {
  const changed = Number(value) !== def;
  return <div className={`text-[10px] mt-0.5 ${changed ? "text-amber-700 font-semibold" : "text-muted"}`}>Default {def}{changed ? " · changed" : ""}</div>;
}

export function ColumnTypeRulesSection() {
  const [saved, setSaved] = useState<ColumnTypeConfig | null>(null);
  const [cfg, setCfg] = useState<ColumnTypeConfig | null>(null);
  const [hintText, setHintText] = useState({ dataTypes: "", defaults: "" });
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [newRegex, setNewRegex] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "preview" | "apply" | "patterns">("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const show = useCallback((c: ColumnTypeConfig) => {
    setCfg(clone(c));
    setHintText({ dataTypes: c.surrogateHints.dataTypes.join(", "), defaults: c.surrogateHints.defaults.join(", ") });
  }, []);
  const loadPatterns = useCallback(async () => {
    const r = await fetch("/api/classification/patterns");
    if (r.ok) setPatterns(await r.json());
  }, []);

  useEffect(() => {
    fetch("/api/admin/column-type-rules").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) { setError("The rules could not be loaded."); return; }
      setSaved(d.config); show(d.config);
    });
    loadPatterns();
  }, [show, loadPatterns]);

  if (!cfg || !saved) return <div className="text-sm text-muted">{error ?? "Loading…"}</div>;

  const split = (text: string) => Array.from(new Set(text.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean)));
  // What is on screen, with the two hint boxes folded in.
  const current = (): ColumnTypeConfig => ({ ...cfg, surrogateHints: { dataTypes: split(hintText.dataTypes), defaults: split(hintText.defaults) } });
  const dirty = !same(current(), saved);
  const isDefault = same(current(), DEFAULT_COLUMN_TYPE_CONFIG);
  const D = DEFAULT_COLUMN_TYPE_CONFIG;
  const n = (v: string) => (v === "" ? 0 : Number(v));

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "The request failed.");
    return d;
  }
  async function run<T>(what: typeof busy, fn: () => Promise<T>) {
    setBusy(what); setError(null); setNote(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  const save = () => run("save", async () => {
    const d = await call("/api/admin/column-type-rules", "PUT", { config: current() });
    setSaved(d.config); show(d.config); setPreview(null);
    setNote("Saved. The rules apply from the next classification run; use “Apply to existing columns” to re-score the catalog now.");
  });
  const runPreview = () => run("preview", async () => { setPreview(await call("/api/admin/column-type-rules", "POST", { config: current(), apply: false })); });
  const apply = () => {
    if (!confirm("Run the column type classification over every data source with the saved rules? Column types a steward confirmed are kept; where the rules now disagree with one, the column is flagged for review.")) return;
    return run("apply", async () => {
      const d: Preview = await call("/api/admin/column-type-rules", "POST", { apply: true });
      setPreview(d);
      setNote(`Applied to ${d.evaluated} columns: ${d.suggestionChanged} suggestion${d.suggestionChanged === 1 ? "" : "s"} changed.`);
    });
  };

  // Patterns are saved one at a time, as soon as they are changed.
  const addPattern = (group: PatternGroup) => run("patterns", async () => {
    const regex = (newRegex[group] ?? "").trim();
    if (!regex) return;
    await call("/api/classification/patterns", "POST", { pattern_group_code: group, pattern_regex_text: regex });
    setNewRegex({ ...newRegex, [group]: "" }); setPreview(null);
    await loadPatterns();
  });
  const togglePattern = (p: Pattern) => run("patterns", async () => {
    await call(`/api/classification/patterns/${p.patternId}`, "PATCH", { is_enabled_indicator: !p.enabled });
    setPreview(null); await loadPatterns();
  });
  const removePattern = (p: Pattern) => {
    if (!confirm(`Remove the pattern ${p.regex}?`)) return;
    return run("patterns", async () => { await call(`/api/classification/patterns/${p.patternId}`, "DELETE"); setPreview(null); await loadPatterns(); });
  };
  const restorePatterns = () => run("patterns", async () => {
    const d = await call("/api/admin/column-type-rules", "POST", { action: "restorePatterns" });
    await loadPatterns(); setPreview(null);
    setNote(d.added + d.enabled === 0 ? "All default patterns are already in place." : `Default patterns restored: ${d.added} added back, ${d.enabled} switched on.`);
  });

  const num = "w-20 border border-line rounded-md px-2 py-1 text-[13px] text-ink bg-white text-end focus:outline-none focus:border-brand-purple";
  const text = "w-full border border-line rounded-md px-2.5 py-1.5 text-[13px] font-mono text-ink bg-white focus:outline-none focus:border-brand-purple";
  const card = "rounded-lg border border-line bg-white px-5 py-4";

  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink">Column Type Rules</h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          A classification run suggests for every column whether it is a Business or a Technical column. It goes down a list
          of rules and the first rule that fits decides; that rule also sets the confidence. A column type confirmed by a
          steward, or read from the source, is never changed by these rules.
        </p>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      {note && <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{note}</div>}

      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-ink">Column name patterns</div>
          <button onClick={restorePatterns} disabled={busy !== ""} className="text-[12px] text-brand-purple font-medium hover:underline disabled:opacity-40">Restore default patterns</button>
        </div>
        <p className="text-[11px] text-muted mt-0.5 mb-3">
          Regular expressions tested against the column name, ignoring case: <span className="font-mono">^</span> is the start of the name,{" "}
          <span className="font-mono">$</span> the end (so <span className="font-mono">_id$</span> means “ends with _id”). A change here is saved immediately.
          Click a pattern to switch it off or on.
        </p>
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const list = patterns.filter((p) => p.group === g.code);
            return (
              <div key={g.code}>
                <div className="text-[13px] font-semibold text-ink">{g.label}</div>
                <div className="text-[11px] text-muted mb-1.5">{g.note}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {list.map((p) => (
                    <span key={p.patternId} title={[p.notes, p.sourceName ? `Only for the data source ${p.sourceName}` : null, p.enabled ? "Click to switch off" : "Switched off — click to switch on"].filter(Boolean).join(" · ")}
                      className={`inline-flex items-center gap-1 rounded-md border ps-2 pe-1 py-0.5 text-[12px] font-mono ${p.enabled ? "bg-canvas-soft border-line text-ink" : "bg-white border-dashed border-line text-muted line-through"}`}>
                      <button onClick={() => togglePattern(p)} disabled={busy !== ""} dir="ltr">{p.regex}</button>
                      {p.sourceName && <span className="font-sans text-[9px] font-semibold px-1 rounded bg-sky-50 text-sky-700 no-underline">{p.sourceName}</span>}
                      <button onClick={() => removePattern(p)} disabled={busy !== ""} aria-label={`Remove ${p.regex}`} className="w-4 h-4 grid place-items-center rounded text-muted hover:text-red-600 hover:bg-red-50 font-sans">×</button>
                    </span>
                  ))}
                  {list.length === 0 && <span className="text-[12px] text-muted italic">No patterns.</span>}
                  <span className="inline-flex items-center gap-1">
                    <input dir="ltr" value={newRegex[g.code] ?? ""} onChange={(e) => setNewRegex({ ...newRegex, [g.code]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") addPattern(g.code); }} placeholder="add a pattern"
                      className="w-32 border border-line rounded-md px-2 py-0.5 text-[12px] font-mono bg-white focus:outline-none focus:border-brand-purple" />
                    <button onClick={() => addPattern(g.code)} disabled={busy !== "" || !(newRegex[g.code] ?? "").trim()} className="text-[12px] text-brand-purple font-medium hover:underline disabled:opacity-40">Add</button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <div className="text-sm font-bold text-ink">Surrogate key hints</div>
        <p className="text-[11px] text-muted mt-0.5 mb-3">
          Besides the surrogate key name patterns, a column also looks like a surrogate key when its data type or its default value
          contains one of these. Plain text separated with commas, ignoring case.
        </p>
        <div className="space-y-3">
          {([["dataTypes", "Data type contains"], ["defaults", "Default value contains"]] as const).map(([key, label]) => {
            const changed = !same(split(hintText[key]), D.surrogateHints[key]);
            return (
              <div key={key} className="grid grid-cols-[230px_1fr] gap-3 items-start">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{label}</div>
                  {changed && (
                    <div className="text-[10px] text-amber-700 font-semibold">
                      changed · <button onClick={() => setHintText({ ...hintText, [key]: D.surrogateHints[key].join(", ") })} className="text-brand-purple font-normal hover:underline">use default</button>
                    </div>
                  )}
                </div>
                <div>
                  <input dir="ltr" className={text} value={hintText[key]} onChange={(e) => setHintText({ ...hintText, [key]: e.target.value })} />
                  <div className="text-[10px] text-muted mt-0.5" dir="ltr">Default: {D.surrogateHints[key].join(", ")}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <div className="text-sm font-bold text-ink">Rules and their confidence</div>
        <p className="text-[11px] text-muted mt-0.5 mb-2">
          Tried from top to bottom; the first that fits decides. The confidence is between 0 and 1. The order and the decision of
          each rule are fixed, because every rule assumes the ones above it did not fit.
        </p>
        <div className="divide-y divide-line-soft">
          {RULES.map((r) => (
            <div key={r.key} className="grid grid-cols-[34px_1fr_90px_90px] gap-3 items-start py-2.5">
              <div className="text-[12px] font-bold text-muted pt-0.5">{r.no}</div>
              <div className="text-[13px] text-ink leading-snug">{r.when}</div>
              <div className="pt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${r.decision === "Business" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-700 border-gray-300"}`}>{r.decision}</span>
              </div>
              <div>
                <input type="number" min={0} max={1} step={0.01} className={num} value={cfg.ruleConfidence[r.key]}
                  onChange={(e) => setCfg({ ...cfg, ruleConfidence: { ...cfg.ruleConfidence, [r.key]: n(e.target.value) } })} />
                <DefaultHint value={cfg.ruleConfidence[r.key]} def={D.ruleConfidence[r.key]} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <div className="text-sm font-bold text-ink">Adjustments after the rule</div>
        <p className="text-[11px] text-muted mt-0.5 mb-2">Applied in this order to the confidence the deciding rule gave.</p>
        <div className="divide-y divide-line-soft">
          {MODIFIERS.map((m) => (
            <div key={m.key} className="grid grid-cols-[1fr_90px] gap-3 items-start py-2.5">
              <div>
                <div className="text-[13px] font-medium text-ink">{m.label}</div>
                <div className="text-[11px] text-muted leading-snug">{m.note}</div>
              </div>
              <div>
                <input type="number" min={0} max={1} step={0.01} className={num} value={cfg.modifiers[m.key]}
                  onChange={(e) => setCfg({ ...cfg, modifiers: { ...cfg.modifiers, [m.key]: n(e.target.value) } })} />
                <DefaultHint value={cfg.modifiers[m.key]} def={D.modifiers[m.key]} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} mt-4`}>
        <div className="text-sm font-bold text-ink">Confidence bands</div>
        <p className="text-[11px] text-muted mt-0.5 mb-3">
          Where High and Medium start. Below Medium the confidence is Low. When “auto-accept high confidence” is switched on for a
          crawl, suggestions in the High band are accepted without review.
        </p>
        <div className="flex items-start gap-8">
          {([["high", "High from"], ["medium", "Medium from"]] as const).map(([key, label]) => (
            <div key={key} className="flex items-start gap-2">
              <div className="text-[13px] text-ink pt-1">{label}</div>
              <div>
                <input type="number" min={0} max={1} step={0.01} className={num} value={cfg.bands[key]}
                  onChange={(e) => setCfg({ ...cfg, bands: { ...cfg.bands, [key]: n(e.target.value) } })} />
                <DefaultHint value={cfg.bands[key]} def={D.bands[key]} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-5 flex-wrap">
        <button onClick={save} disabled={!dirty || busy !== ""} className="btn btn-primary btn-sm disabled:opacity-50">{busy === "save" ? "Saving…" : "Save rules"}</button>
        <button onClick={runPreview} disabled={busy !== ""} className="btn btn-sm">{busy === "preview" ? "Scoring…" : "Preview on existing columns"}</button>
        <button onClick={apply} disabled={dirty || busy !== ""} title={dirty ? "Save the rules first" : undefined} className="btn btn-sm disabled:opacity-50">{busy === "apply" ? "Applying…" : "Apply to existing columns"}</button>
        <span className="flex-1" />
        {dirty && <button onClick={() => { show(saved); setPreview(null); }} disabled={busy !== ""} className="text-[12px] text-muted hover:text-ink">Discard changes</button>}
        <button onClick={() => { show(DEFAULT_COLUMN_TYPE_CONFIG); setPreview(null); }} disabled={isDefault || busy !== ""} className="text-[12px] text-brand-purple font-medium hover:underline disabled:opacity-40 disabled:no-underline">Reset to defaults</button>
      </div>
      {dirty && <p className="text-[11px] text-amber-700 mt-2">There are unsaved changes. The preview uses what is on screen; a classification run uses what is saved.</p>}

      {preview && (
        <div className={`${card} mt-4`}>
          <div className="text-sm font-bold text-ink">{preview.applied ? "Applied to existing columns" : "Preview"}</div>
          {preview.applied ? (
            <p className="text-[12px] text-ink-soft mt-1">{preview.evaluated} columns scored: <strong>{preview.suggestionChanged}</strong> suggestions changed.</p>
          ) : (
            <>
              <p className="text-[12px] text-ink-soft mt-1">
                {preview.evaluated} columns scored. Compared with the saved rules, <strong>{preview.suggestionChanged}</strong> would get a different
                suggestion and {preview.bandChanged} would keep their suggestion but change confidence band.
              </p>
              <p className="text-[11px] text-muted mt-1">
                With the rules on screen, {preview.confirmedDisagree} column{preview.confirmedDisagree === 1 ? "" : "s"} with a steward-confirmed type would disagree
                with the rules (flagged for review when applied). {preview.neverScored} column{preview.neverScored === 1 ? " has" : "s have"} no suggestion yet and would get one when applied.
              </p>
            </>
          )}
          {preview.changes.length > 0 && (
            <div className="mt-3 rounded-md border border-line-soft overflow-hidden">
              <div className="grid grid-cols-[1.6fr_0.8fr_1.2fr_0.5fr] gap-3 px-3 py-2 bg-canvas-soft text-[10px] uppercase tracking-wider text-muted font-bold">
                <div>Column</div><div>Saved rules</div><div>Rules on screen</div><div>Rule</div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-line-soft">
                {preview.changes.map((c) => (
                  <div key={c.attributeId} className="grid grid-cols-[1.6fr_0.8fr_1.2fr_0.5fr] gap-3 px-3 py-1.5 text-[12px]">
                    <div className="font-mono text-ink truncate" dir="ltr" title={`${c.source} · ${c.table}.${c.column}`}>{c.table}.{c.column}</div>
                    <div className="text-ink-soft">{cls(c.fromClass)} · {c.fromBand.toLowerCase()}</div>
                    <div className="text-ink font-medium">{cls(c.toClass)} · {c.toBand.toLowerCase()} ({c.toConfidence})</div>
                    <div className="text-muted">{c.rule.replace(/^R/, "").replace("_REFERENCED", "a").replace("_UNREFERENCED", "b")}</div>
                  </div>
                ))}
              </div>
              {preview.suggestionChanged > preview.changes.length && <div className="px-3 py-1.5 text-[11px] text-muted bg-canvas-soft">Showing the first {preview.changes.length} of {preview.suggestionChanged}.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
