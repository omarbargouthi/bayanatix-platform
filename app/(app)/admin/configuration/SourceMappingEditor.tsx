"use client";

import { useState } from "react";

// Where a field's value is read from at the source, one row per kind of data source.
// Used for custom fields and for built-in fields alike (Configuration > Fields Setting):
// the administrator adds a source, picks what to read (an extended property or the
// comment) and names the property / the key, and a how-to for that exact choice shows
// how to tag the value at the source.

export type SourceMethod = "EXTENDED_PROPERTY" | "COMMENT_KEY";
export type SourceMapping = { sourceTypeCode: string; methodCode: SourceMethod; sourceKey: string };

export const MAPPING_SOURCES: { code: string; label: string; short: string }[] = [
  { code: "MSSQL",    label: "SQL Server / Azure SQL / Managed Instance", short: "SQL Server" },
  { code: "POSTGRES", label: "PostgreSQL", short: "PostgreSQL" },
  { code: "ORACLE",   label: "Oracle", short: "Oracle" },
  { code: "MYSQL",    label: "MySQL", short: "MySQL" },
];
const shortOf = (code: string) => MAPPING_SOURCES.find((s) => s.code === code)?.short ?? code;
const methodLabel = (source: string, m: SourceMethod) =>
  m === "EXTENDED_PROPERTY" ? "Extended property" : source === "MSSQL" ? "Comment (MS_Description)" : "Comment";

/** The statement to run at the source so the crawl finds the value. */
function howTo(source: string, method: SourceMethod, level: "TABLE" | "COLUMN", key: string, example: string): { intro: string; code: string } {
  const k = key.trim() || (method === "EXTENDED_PROPERTY" ? "PropertyName" : "key");
  const col = level === "COLUMN";
  if (source === "MSSQL" && method === "EXTENDED_PROPERTY") {
    return {
      intro: `Add an extended property named "${k}" to the ${col ? "column" : "table"}. Its value is what Bayanis reads.`,
      code: `EXEC sp_addextendedproperty @name = N'${k}', @value = N'${example}',
  @level0type = 'SCHEMA', @level0name = N'crm',
  @level1type = 'TABLE',  @level1name = N'customer'${col ? `,
  @level2type = 'COLUMN', @level2name = N'email'` : ""};
-- to change it later: sp_updateextendedproperty with the same arguments`,
    };
  }
  const pair = `${k}: ${example}`;
  if (source === "MSSQL") {
    return {
      intro: `Put a "${k}: value" pair inside the ${col ? "column" : "table"}'s description (the MS_Description extended property). Separate pairs with a semicolon.`,
      code: `EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What this ${col ? "column" : "table"} holds; ${pair}',
  @level0type = 'SCHEMA', @level0name = N'crm',
  @level1type = 'TABLE',  @level1name = N'customer'${col ? `,
  @level2type = 'COLUMN', @level2name = N'email'` : ""};`,
    };
  }
  if (source === "MYSQL") {
    return {
      intro: `Put a "${k}: value" pair inside the ${col ? "column" : "table"} comment. Separate pairs with a semicolon.`,
      code: col
        ? `ALTER TABLE crm.customer MODIFY COLUMN email VARCHAR(255)
  COMMENT 'What this column holds; ${pair}';
-- repeat the column's full definition: MODIFY replaces it`
        : `ALTER TABLE crm.customer COMMENT = 'What this table holds; ${pair}';`,
    };
  }
  return {
    intro: `Put a "${k}: value" pair inside the ${col ? "column" : "table"} comment. Separate pairs with a semicolon.`,
    code: col
      ? `COMMENT ON COLUMN crm.customer.email IS 'What this column holds; ${pair}';`
      : `COMMENT ON TABLE crm.customer IS 'What this table holds; ${pair}';`,
  };
}

export function SourceMappingEditor({ level, mappings, onSave, onRemove, valueHint, exampleValue }: {
  level: "TABLE" | "COLUMN";
  mappings: SourceMapping[];
  /** Adds or changes one source's mapping; returns an error message or null. */
  onSave: (m: SourceMapping) => Promise<string | null>;
  onRemove: (sourceTypeCode: string) => Promise<void>;
  /** What values are accepted for this field, shown in the guide. */
  valueHint?: string;
  exampleValue?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState("");
  const [method, setMethod] = useState<SourceMethod>("COMMENT_KEY");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = MAPPING_SOURCES.filter((s) => !mappings.some((m) => m.sourceTypeCode === s.code) || s.code === source);
  const example = exampleValue ?? "value";

  function start(prefill?: SourceMapping) {
    setError(null); setAdding(true);
    const first = prefill?.sourceTypeCode ?? "";
    setSource(first); setMethod(prefill?.methodCode ?? "COMMENT_KEY"); setKey(prefill?.sourceKey ?? "");
  }
  function pickSource(code: string) {
    setSource(code);
    // An extended property is the natural choice on SQL Server and does not exist elsewhere.
    setMethod(code === "MSSQL" ? "EXTENDED_PROPERTY" : "COMMENT_KEY");
  }
  async function save() {
    if (!source) { setError("Choose the data source."); return; }
    if (!key.trim()) { setError(method === "EXTENDED_PROPERTY" ? "Enter the property name." : "Enter the key to look for in the comment."); return; }
    setBusy(true); setError(null);
    try {
      const err = await onSave({ sourceTypeCode: source, methodCode: method, sourceKey: key.trim() });
      if (err) { setError(err); return; }
      setAdding(false);
    } finally { setBusy(false); }
  }

  const guide = source ? howTo(source, method, level, key, example) : null;
  const input = "w-full border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink bg-white focus:outline-none focus:border-brand-purple";
  const label = "block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1";

  return (
    <div className="space-y-2">
      {mappings.length === 0 && !adding && <div className="text-[12px] text-muted">Not read from any source — the value is entered in Bayanis.</div>}
      {mappings.length > 0 && (
        <div className="rounded-md border border-line-soft divide-y divide-line-soft bg-white">
          {mappings.map((m) => (
            <div key={m.sourceTypeCode} className="flex items-center gap-3 px-3 py-2 text-[12px]">
              <span className="font-semibold text-ink w-[92px] shrink-0">{shortOf(m.sourceTypeCode)}</span>
              <span className="text-ink-soft w-[150px] shrink-0">{methodLabel(m.sourceTypeCode, m.methodCode)}</span>
              <span className="text-muted shrink-0">{m.methodCode === "EXTENDED_PROPERTY" ? "property" : "key"}</span>
              <span className="font-mono text-ink flex-1 truncate" dir="ltr">{m.sourceKey}</span>
              <button onClick={() => start(m)} className="text-brand-purple hover:underline">Change</button>
              <button onClick={() => onRemove(m.sourceTypeCode)} className="text-red-600 hover:underline">Remove</button>
            </div>
          ))}
        </div>
      )}

      {!adding && mappings.length < MAPPING_SOURCES.length && (
        <button onClick={() => start()} className="text-[12px] text-brand-purple font-medium hover:underline">+ Add source</button>
      )}

      {adding && (
        <div className="rounded-lg border border-brand-purple/30 bg-brand-purple/[0.03] px-4 py-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Data source</label>
              <select className={input} value={source} onChange={(e) => pickSource(e.target.value)}>
                <option value="">— choose —</option>
                {available.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Read the value from</label>
              <select className={input} value={method} disabled={!source} onChange={(e) => setMethod(e.target.value as SourceMethod)}>
                {source === "MSSQL" && <option value="EXTENDED_PROPERTY">Extended property</option>}
                <option value="COMMENT_KEY">{source === "MSSQL" ? "Comment (MS_Description)" : "Comment"}</option>
              </select>
            </div>
            <div>
              <label className={label}>{method === "EXTENDED_PROPERTY" ? "Property name" : "Key in the comment"}</label>
              <input className={`${input} font-mono`} dir="ltr" value={key} disabled={!source} onChange={(e) => setKey(e.target.value)}
                placeholder={method === "EXTENDED_PROPERTY" ? "e.g. DataOwner" : "e.g. owner"}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
            </div>
          </div>

          {guide && (
            <div className="rounded-md bg-white border border-line-soft px-3 py-2.5 text-[12px] text-ink-soft space-y-1.5">
              <div className="font-semibold text-ink">How to — {shortOf(source)}, {methodLabel(source, method).toLowerCase()}</div>
              <div>{guide.intro}</div>
              <pre className="font-mono text-[11px] whitespace-pre-wrap text-ink bg-canvas-soft rounded px-2.5 py-2" dir="ltr">{guide.code}</pre>
              {valueHint && <div><span className="font-semibold text-ink">Accepted values:</span> {valueHint}. Anything else is skipped and listed in the crawl log.</div>}
              <div className="text-muted">The names above (crm, customer, email) are examples. The value is read on the next crawl of a source of this kind.</div>
            </div>
          )}
          {!guide && <div className="text-[12px] text-muted">Choose the data source to see how to tag the value there.</div>}

          {error && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn btn-sm">Cancel</button>
            <button onClick={save} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save source"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
