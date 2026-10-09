"use client";

import { useEffect, useState } from "react";

// Which source property / comment key fills each built-in field during a crawl (db/166):
// table type, column type, friendly name and the Encrypted flag. One cell per field and
// source type; a cell saves when its key is changed, and an empty key removes the mapping.

type Method = "EXTENDED_PROPERTY" | "COMMENT_KEY";
type Field = { code: string; level: "TABLE" | "COLUMN"; label: string; hint: string };
type Mapping = { fieldCode: string; sourceTypeCode: string; methodCode: Method; sourceKey: string };
type EmptyMode = "KEEP" | "CLEAR_SYNCED" | "CLEAR_ALWAYS";
const EMPTY_MODES: { value: EmptyMode; label: string; note: string }[] = [
  { value: "KEEP", label: "Keep the value in Bayanis", note: "Nothing is cleared. A value entered or confirmed in Bayanis stays until the source provides one." },
  { value: "CLEAR_SYNCED", label: "Clear it, only if it had come from the source", note: "A value the source provided earlier and has since removed is cleared. Values entered in Bayanis are kept." },
  { value: "CLEAR_ALWAYS", label: "Always clear it — the source is authoritative", note: "Every mapped field with no value at the source is cleared, including values entered in Bayanis. On the next crawl this can clear many columns at once." },
];

const SOURCES = [
  { code: "MSSQL", label: "SQL Server" },
  { code: "POSTGRES", label: "PostgreSQL" },
  { code: "ORACLE", label: "Oracle" },
  { code: "MYSQL", label: "MySQL" },
];
const defaultMethod = (source: string): Method => (source === "MSSQL" ? "EXTENDED_PROPERTY" : "COMMENT_KEY");

export function BuiltinFieldMappings() {
  const [fields, setFields] = useState<Field[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [draft, setDraft] = useState<Record<string, { methodCode: Method; sourceKey: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCell, setSavedCell] = useState<string | null>(null);
  const [emptyMode, setEmptyMode] = useState<EmptyMode>("KEEP");
  const [modeSaved, setModeSaved] = useState(false);

  async function changeEmptyMode(next: EmptyMode) {
    if (next === emptyMode) return;
    if (next === "CLEAR_ALWAYS" && !confirm("With this setting the next crawl clears every mapped field that has no value at the source, including values entered in Bayanis. Each cleared value goes to the table's metadata-update review. Continue?")) return;
    setError(null);
    const r = await fetch("/api/admin/builtin-field-mappings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emptySourceMode: next }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error ?? "The setting could not be saved."); return; }
    setEmptyMode(next); setModeSaved(true); setTimeout(() => setModeSaved(false), 1500);
  }

  useEffect(() => {
    fetch("/api/admin/builtin-field-mappings").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setFields(d.fields); setMappings(d.mappings); setEmptyMode(d.emptySourceMode ?? "KEEP");
    });
  }, []);

  const cellKey = (field: string, source: string) => `${field}|${source}`;
  const saved = (field: string, source: string) => mappings.find((m) => m.fieldCode === field && m.sourceTypeCode === source);
  const valueOf = (field: string, source: string) => {
    const s = saved(field, source);
    return draft[cellKey(field, source)] ?? { methodCode: s?.methodCode ?? defaultMethod(source), sourceKey: s?.sourceKey ?? "" };
  };

  async function save(field: string, source: string) {
    const key = cellKey(field, source);
    const v = valueOf(field, source);
    const s = saved(field, source);
    if ((s?.sourceKey ?? "") === v.sourceKey.trim() && (s?.methodCode ?? defaultMethod(source)) === v.methodCode) return;
    setBusy(key); setError(null);
    try {
      const r = await fetch("/api/admin/builtin-field-mappings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldCode: field, sourceTypeCode: source, methodCode: v.methodCode, sourceKey: v.sourceKey }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b.error ?? "The mapping could not be saved."); return; }
      setMappings(b.mappings);
      setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
      setSavedCell(key); setTimeout(() => setSavedCell((c) => (c === key ? null : c)), 1500);
    } finally { setBusy(null); }
  }

  if (fields.length === 0) return null;

  return (
    <div className="mt-10">
      <h3 className="text-base font-bold text-ink">Built-in fields from the source system</h3>
      <p className="text-xs text-muted mt-1 max-w-3xl leading-relaxed">
        The same idea as filling a custom field from the source, for four built-in fields. During a crawl, Bayanis reads the value
        from a SQL Server extended property, or from a <code className="font-mono">key: value</code> pair inside the table or column
        comment (for example <code className="font-mono">table_type: Master; </code>). A value is applied only when it matches what
        Bayanis defines for the field — anything else is skipped and listed in the crawl log. The source wins over the value in the
        catalog. Leave a key empty to not read that field from that kind of source.
      </p>

      {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas-soft border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-2.5 font-semibold w-[240px]">Field</th>
              {SOURCES.map((s) => <th key={s.code} className="px-3 py-2.5 font-semibold">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.code} className="border-b border-line-soft last:border-b-0 align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-ink">{f.label} <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted align-middle">{f.level === "TABLE" ? "table" : "column"}</span></div>
                  <div className="text-[11px] text-muted mt-0.5 leading-snug">Accepts: {f.hint}</div>
                </td>
                {SOURCES.map((s) => {
                  const key = cellKey(f.code, s.code);
                  const v = valueOf(f.code, s.code);
                  return (
                    <td key={s.code} className="px-3 py-3">
                      {s.code === "MSSQL" ? (
                        <select value={v.methodCode} disabled={busy === key}
                          onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...v, methodCode: e.target.value as Method } }))}
                          onBlur={() => save(f.code, s.code)}
                          className="w-full border border-line rounded-md px-2 py-1 text-[11px] text-ink-soft mb-1 bg-white">
                          <option value="EXTENDED_PROPERTY">Extended property</option>
                          <option value="COMMENT_KEY">Key in MS_Description</option>
                        </select>
                      ) : (
                        <div className="text-[11px] text-muted mb-1 py-1">Key in the comment</div>
                      )}
                      <input value={v.sourceKey} disabled={busy === key} dir="ltr"
                        placeholder={v.methodCode === "EXTENDED_PROPERTY" ? "property name" : "key"}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: { ...v, sourceKey: e.target.value } }))}
                        onBlur={() => save(f.code, s.code)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-full border border-line rounded-md px-2 py-1.5 text-[12px] font-mono text-ink focus:outline-none focus:border-brand-purple" />
                      <div className="h-4 text-[10px] text-emerald-700">{savedCell === key ? "✓ saved" : ""}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-white px-4 py-4 max-w-3xl">
        <div className="text-sm font-semibold text-ink">When the source has no value for a mapped field</div>
        <p className="text-[11px] text-muted mt-0.5">The property or comment key is missing or empty at the source for a table or column.</p>
        <div className="mt-3 space-y-2">
          {EMPTY_MODES.map((m) => (
            <label key={m.value} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="empty-source-mode" className="mt-0.5 accent-brand-purple" checked={emptyMode === m.value} onChange={() => changeEmptyMode(m.value)} />
              <span>
                <span className={`text-[13px] font-medium ${m.value === "CLEAR_ALWAYS" && emptyMode === m.value ? "text-amber-800" : "text-ink"}`}>{m.label}</span>
                <span className="block text-[11px] text-muted leading-snug">{m.note}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-3 leading-snug">
          Whatever a crawl changes or clears on a table that was crawled before is sent to that table&apos;s stewards for review
          (the Metadata Update workflow), the same as other changes found on a re-crawl.{modeSaved && <span className="text-emerald-700 font-semibold"> ✓ saved</span>}
        </p>
      </div>
    </div>
  );
}
