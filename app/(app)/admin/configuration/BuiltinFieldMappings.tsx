"use client";

import { useCallback, useEffect, useState } from "react";
import { SourceMappingEditor, type SourceMapping } from "./SourceMappingEditor";

// Configuration > Fields Setting > Built-in Fields (db/166, db/167): for table type,
// column type, friendly name and the Encrypted flag, which data sources a crawl reads
// the value from, and what a crawl does when the source has no value.

type Field = { code: string; level: "TABLE" | "COLUMN"; label: string; hint: string };
type Mapping = SourceMapping & { fieldCode: string };
type EmptyMode = "KEEP" | "CLEAR_SYNCED" | "CLEAR_ALWAYS";

const EMPTY_MODES: { value: EmptyMode; label: string; note: string }[] = [
  { value: "KEEP", label: "Keep the value in Bayanis", note: "Nothing is cleared. A value entered or confirmed in Bayanis stays until the source provides one." },
  { value: "CLEAR_SYNCED", label: "Clear it, only if it had come from the source", note: "A value the source provided earlier and has since removed is cleared. Values entered in Bayanis are kept." },
  { value: "CLEAR_ALWAYS", label: "Always clear it — the source is authoritative", note: "Every mapped field with no value at the source is cleared, including values entered in Bayanis. On the next crawl this can clear many columns at once." },
];
const EXAMPLE: Record<string, string> = { TABLE_TYPE: "Master", COLUMN_TYPE: "Business", FRIENDLY_NAME: "Customer Email", ENCRYPTED: "yes" };

export function BuiltinFieldMappings() {
  const [fields, setFields] = useState<Field[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [emptyMode, setEmptyMode] = useState<EmptyMode>("KEEP");
  const [modeSaved, setModeSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/builtin-field-mappings");
    if (!r.ok) return;
    const d = await r.json();
    setFields(d.fields); setMappings(d.mappings); setEmptyMode(d.emptySourceMode ?? "KEEP");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function put(fieldCode: string, m: SourceMapping): Promise<string | null> {
    const r = await fetch("/api/admin/builtin-field-mappings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldCode, ...m }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return b.error ?? "The source could not be saved.";
    setMappings(b.mappings);
    return null;
  }

  async function changeEmptyMode(next: EmptyMode) {
    if (next === emptyMode) return;
    if (next === "CLEAR_ALWAYS" && !confirm("With this setting the next crawl clears every mapped field that has no value at the source, including values entered in Bayanis. Each cleared value goes to the table's metadata-update review. Continue?")) return;
    setError(null);
    const r = await fetch("/api/admin/builtin-field-mappings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emptySourceMode: next }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error ?? "The setting could not be saved."); return; }
    setEmptyMode(next); setModeSaved(true); setTimeout(() => setModeSaved(false), 1500);
  }

  return (
    <div>
      <p className="text-xs text-muted max-w-3xl leading-relaxed">
        Four fields Bayanis already has on every table and column can be filled from the source system during a crawl. For each
        field, add the data sources to read it from. A value is applied only when it matches what Bayanis defines for the field,
        and the source wins over the value in the catalog.
      </p>
      {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="mt-4 space-y-3 max-w-3xl">
        {fields.map((f) => (
          <div key={f.code} className="rounded-lg border border-line bg-white px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-ink">{f.label}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-muted">{f.level === "TABLE" ? "table" : "column"}</span>
              <span className="text-[11px] text-muted">Accepts: {f.hint}</span>
            </div>
            <SourceMappingEditor
              level={f.level}
              mappings={mappings.filter((m) => m.fieldCode === f.code)}
              valueHint={f.hint} exampleValue={EXAMPLE[f.code]}
              onSave={(m) => put(f.code, m)}
              onRemove={async (sourceTypeCode) => { await put(f.code, { sourceTypeCode, methodCode: "COMMENT_KEY", sourceKey: "" }); }}
            />
          </div>
        ))}
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
