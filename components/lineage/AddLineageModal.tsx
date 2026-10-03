"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";
import { layerLabels } from "./LineageNode";

export type PickedTable = { entityId: number; name: string; schemaName: string | null };
type Endpoint =
  | { mode: "catalog"; table: PickedTable | null }
  | { mode: "external"; name: string; layerCode: string };
type Column = { attributeId: number; name: string };
type TransformationType = { code: string; name: string };
type Mapping = { sourceAttributeId: number | null; transformationTypeCode: string; expression: string };

const EXTERNAL_LAYERS = ["SOURCE", "RAW", "STAGING", "TABLE", "VIEW", "LAKEHOUSE", "SEMANTIC_MODEL", "REPORT"];

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// One side of the link: a catalog table found by search, or a named external
// asset (an application, a file feed, a report tool) that isn't crawled.
function EndpointPicker({ label, value, onChange }: { label: string; value: Endpoint; onChange: (v: Endpoint) => void }) {
  const { t } = useLang();
  const le = t.lineageEditor;
  const layers = layerLabels(t.lineage);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedTable[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => {
      fetch(`/api/lineage/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: { assetType: string; assetId: number; name: string; schemaName: string | null }[]) =>
          setResults(rows.filter((r) => r.assetType === "DATA_ENTITIES").map((r) => ({ entityId: r.assetId, name: r.name, schemaName: r.schemaName }))))
        .catch(() => setResults([]));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="flex-1 min-w-0">
      <label className="field-label">{label}</label>
      {value.mode === "catalog" && value.table && (
        <div className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2 bg-canvas-soft">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink truncate" dir="auto">{value.table.name}</div>
            {value.table.schemaName && <div className="text-[11px] text-muted truncate" dir="auto">{value.table.schemaName}</div>}
          </div>
          <button type="button" onClick={() => onChange({ mode: "catalog", table: null })} className="text-[12px] text-brand-purple hover:underline shrink-0">{le.change}</button>
        </div>
      )}
      {value.mode === "catalog" && !value.table && (
        <div className="relative">
          <input
            className="input-field w-full"
            placeholder={le.searchTable}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && query.trim() && (
            <div className="absolute top-full mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-56 overflow-y-auto z-20">
              {results.length === 0 && <div className="px-3 py-2 text-[12px] text-muted">{le.noTables}</div>}
              {results.map((r) => (
                <button
                  key={r.entityId}
                  type="button"
                  onMouseDown={() => { onChange({ mode: "catalog", table: r }); setQuery(""); }}
                  className="w-full text-start px-3 py-2 hover:bg-canvas-soft text-sm border-b border-line-soft last:border-0"
                >
                  <span className="font-medium text-ink" dir="auto">{r.name}</span>
                  {r.schemaName && <span className="text-xs text-muted ms-2" dir="auto">{r.schemaName}</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => onChange({ mode: "external", name: "", layerCode: "SOURCE" })} className="mt-1.5 text-[12px] text-brand-purple hover:underline">
            {le.externalToggle}
          </button>
        </div>
      )}
      {value.mode === "external" && (
        <div className="space-y-2">
          <input
            className="input-field w-full"
            placeholder={le.externalNamePh}
            aria-label={le.externalName}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
          <select className="input-field w-full" aria-label={le.layer} value={value.layerCode} onChange={(e) => onChange({ ...value, layerCode: e.target.value })}>
            {EXTERNAL_LAYERS.map((code) => <option key={code} value={code}>{layers[code] ?? code}</option>)}
          </select>
          <button type="button" onClick={() => onChange({ mode: "catalog", table: null })} className="text-[12px] text-brand-purple hover:underline">{le.backToCatalog}</button>
        </div>
      )}
    </div>
  );
}

export function AddLineageModal({ initialSource, initialTarget, onClose, onSaved }: {
  initialSource?: PickedTable | null;
  initialTarget?: PickedTable | null;
  onClose: () => void;
  // mode PENDING = sent for approval as requestId; APPLIED = in effect now.
  onSaved: (result?: { mode: "APPLIED" | "PENDING"; requestId: number | null }) => void;
}) {
  const { t } = useLang();
  const le = t.lineageEditor;
  const [source, setSource] = useState<Endpoint>({ mode: "catalog", table: initialSource ?? null });
  const [target, setTarget] = useState<Endpoint>({ mode: "catalog", table: initialTarget ?? null });
  const [types, setTypes] = useState<TransformationType[]>([]);
  const [typeCode, setTypeCode] = useState("MANUAL");
  const [logic, setLogic] = useState("");
  const [sourceCols, setSourceCols] = useState<Column[]>([]);
  const [targetCols, setTargetCols] = useState<Column[]>([]);
  const [mappings, setMappings] = useState<Record<number, Mapping>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/lineage/transformation-types").then((r) => (r.ok ? r.json() : [])).then(setTypes).catch(() => {});
  }, []);

  const sourceId = source.mode === "catalog" ? source.table?.entityId ?? null : null;
  const targetId = target.mode === "catalog" ? target.table?.entityId ?? null : null;

  useEffect(() => {
    setSourceCols([]);
    if (sourceId == null) return;
    fetch(`/api/lineage/entities/${sourceId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setSourceCols).catch(() => {});
  }, [sourceId]);
  useEffect(() => {
    setTargetCols([]);
    setMappings({});
    if (targetId == null) return;
    fetch(`/api/lineage/entities/${targetId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setTargetCols).catch(() => {});
  }, [targetId]);

  const mappingOf = (id: number): Mapping => mappings[id] ?? { sourceAttributeId: null, transformationTypeCode: "DIRECT", expression: "" };
  const setMapping = (id: number, patch: Partial<Mapping>) => setMappings((prev) => ({ ...prev, [id]: { ...mappingOf(id), ...patch } }));
  const mappedCount = useMemo(() => Object.values(mappings).filter((m) => m.sourceAttributeId != null).length, [mappings]);

  function autoMatch() {
    const byName = new Map(sourceCols.map((c) => [c.name.toLowerCase(), c.attributeId]));
    setMappings((prev) => {
      const next = { ...prev };
      for (const c of targetCols) {
        const match = byName.get(c.name.toLowerCase());
        if (match != null && next[c.attributeId]?.sourceAttributeId == null) {
          next[c.attributeId] = { sourceAttributeId: match, transformationTypeCode: "DIRECT", expression: "" };
        }
      }
      return next;
    });
  }

  const endpointBody = (e: Endpoint) => e.mode === "catalog" ? { entityId: e.table?.entityId ?? null } : { external: { name: e.name, layerCode: e.layerCode } };
  const ready = (e: Endpoint) => e.mode === "catalog" ? e.table != null : e.name.trim() !== "";

  async function save() {
    setError(null);
    if (!ready(source) || !ready(target)) { setError(le.pickBoth); return; }
    if (sourceId != null && sourceId === targetId) { setError(le.sameAsset); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/lineage/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: endpointBody(source), target: endpointBody(target),
          transformationTypeCode: typeCode, transformationLogicText: logic,
          columnMappings: Object.entries(mappings)
            .filter(([, m]) => m.sourceAttributeId != null)
            .map(([targetAttributeId, m]) => ({
              sourceAttributeId: m.sourceAttributeId, targetAttributeId: Number(targetAttributeId),
              transformationTypeCode: m.transformationTypeCode, expression: m.expression,
            })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? le.saveFailed);
        return;
      }
      onSaved({ mode: d.mode, requestId: d.requestId ?? null });
    } catch {
      setError(le.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const canMapColumns = sourceId != null && targetId != null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-line max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
          <div>
            <h2 className="text-[16px] font-bold text-brand-deep">{le.title}</h2>
            <p className="text-[12px] text-muted mt-0.5">{le.desc}</p>
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <div className="flex items-start gap-4">
            <EndpointPicker label={le.source} value={source} onChange={setSource} />
            <div className="pt-8 text-muted text-lg shrink-0" aria-hidden>{"→"}</div>
            <EndpointPicker label={le.target} value={target} onChange={setTarget} />
          </div>

          <div className="grid grid-cols-[220px_1fr] gap-4">
            <div>
              <label className="field-label">{le.transformation}</label>
              <select className="input-field w-full" value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>
                {types.length === 0 && <option value="MANUAL">Manual</option>}
                {types.map((tt) => <option key={tt.code} value={tt.code}>{tt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">{le.logic}</label>
              <textarea className="input-field w-full font-mono text-[12px]" rows={2} placeholder={le.logicPh} value={logic} onChange={(e) => setLogic(e.target.value)} dir="auto" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-sm font-semibold text-ink">{le.columnMapping}</div>
                <div className="text-[12px] text-muted">{canMapColumns ? le.columnMappingHint : le.columnsNeedTables}</div>
              </div>
              {canMapColumns && targetCols.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-muted">{fill(le.mappedCount, { n: mappedCount })}</span>
                  <button type="button" onClick={autoMatch} className="btn btn-sm">{le.autoMatch}</button>
                </div>
              )}
            </div>
            {canMapColumns && targetCols.length > 0 && (
              <div className="border border-line rounded-lg overflow-hidden mt-2">
                <div className="grid grid-cols-[1fr_1fr_150px_1fr] gap-2 px-3 py-2 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                  <div>{le.targetColumn}</div><div>{le.sourceColumn}</div><div>{le.transformation}</div><div>{le.expression}</div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {targetCols.map((c) => {
                    const m = mappingOf(c.attributeId);
                    return (
                      <div key={c.attributeId} className="grid grid-cols-[1fr_1fr_150px_1fr] gap-2 px-3 py-1.5 border-b border-line-soft last:border-0 items-center">
                        <div className="text-[13px] text-ink truncate" dir="auto" title={c.name}>{c.name}</div>
                        <select
                          className="input-field text-[12px] py-1"
                          value={m.sourceAttributeId ?? ""}
                          onChange={(e) => setMapping(c.attributeId, { sourceAttributeId: e.target.value === "" ? null : Number(e.target.value) })}
                        >
                          <option value="">{le.notMapped}</option>
                          {sourceCols.map((s) => <option key={s.attributeId} value={s.attributeId}>{s.name}</option>)}
                        </select>
                        <select
                          className="input-field text-[12px] py-1"
                          disabled={m.sourceAttributeId == null}
                          value={m.transformationTypeCode}
                          onChange={(e) => setMapping(c.attributeId, { transformationTypeCode: e.target.value })}
                        >
                          {types.filter((tt) => tt.code !== "MANUAL").map((tt) => <option key={tt.code} value={tt.code}>{tt.name}</option>)}
                        </select>
                        <input
                          className="input-field text-[12px] py-1 font-mono"
                          disabled={m.sourceAttributeId == null}
                          value={m.expression}
                          onChange={(e) => setMapping(c.attributeId, { expression: e.target.value })}
                          dir="ltr"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? le.saving : le.save}</button>
        </div>
      </div>
    </div>
  );
}
