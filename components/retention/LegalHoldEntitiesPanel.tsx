"use client";

import { useState, useEffect, useCallback } from "react";

type EntitySearchResult = { entityId: number; entityName: string; schemaName: string; sourceName: string };
type ColumnResult = { attributeId: number; physicalName: string; friendlyName: string | null; isPrimaryKey: boolean };
type Condition = { conditionId: number; attributeId: number; attributeName: string; valueText: string };
type HoldEntity = {
  entityId: number; entityName: string; schemaName: string; sourceName: string;
  keyAttributeId: number | null; keyAttributeName: string | null;
  conditions: Condition[];
};
type Estimate = { available: true; count: number } | { available: false; reason: string };

function EntityPicker({ onSelect }: { onSelect: (e: EntitySearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/catalog/entities?search=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => { setResults(rows); setOpen(true); })
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input
        className="input-sm w-full"
        placeholder="Search tables…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {results.map((e) => (
            <button
              key={e.entityId}
              onMouseDown={() => { onSelect(e); setQuery(""); setResults([]); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-canvas-soft border-b border-line-soft last:border-b-0"
            >
              <div className="text-[12px] font-medium text-ink">{e.entityName}</div>
              <div className="text-[10px] text-muted">{e.sourceName} · {e.schemaName}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddDrivingTableModal({
  holdId, onClose, onAdded,
}: { holdId: number; onClose: () => void; onAdded: () => void }) {
  const [entity, setEntity] = useState<EntitySearchResult | null>(null);
  const [columns, setColumns] = useState<ColumnResult[]>([]);
  const [keyAttributeId, setKeyAttributeId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entity) { setColumns([]); return; }
    fetch(`/api/catalog/entities/${entity.entityId}/columns`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cols: ColumnResult[]) => {
        setColumns(cols);
        const pk = cols.find((c) => c.isPrimaryKey);
        setKeyAttributeId(pk ? pk.attributeId : "");
      })
      .catch(() => setColumns([]));
  }, [entity]);

  async function submit() {
    if (!entity) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/retention/legal-holds/${holdId}/entities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: entity.entityId, keyAttributeId: keyAttributeId || null }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Failed to add table"); return; }
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h2 className="font-bold text-brand-deep text-[14px]">Add Driving Table</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] text-muted mb-1">Table *</label>
            {entity ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
                <span className="text-[12px] font-medium text-ink flex-1 truncate">{entity.entityName}</span>
                <button onClick={() => setEntity(null)} className="text-muted hover:text-red-500 text-sm leading-none">&times;</button>
              </div>
            ) : (
              <EntityPicker onSelect={setEntity} />
            )}
          </div>
          {entity && (
            <div>
              <label className="block text-[11px] text-muted mb-1">Natural Key Column</label>
              <select className="input-sm w-full" value={keyAttributeId} onChange={(e) => setKeyAttributeId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">— None —</option>
                {columns.map((c) => (
                  <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}{c.isPrimaryKey ? " (PK)" : ""}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted mt-1">The column used to identify individual records under this hold, e.g. Employee ID.</p>
            </div>
          )}
          {error && <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-line">
          <button className="btn-secondary text-[12px]" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-[12px]" disabled={!entity || saving} onClick={submit}>
            {saving ? "Adding…" : "Add Table"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConditionRow({ holdId, entityId, condition, onRemoved }: {
  holdId: number; entityId: number; condition: Condition; onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  async function remove() {
    setRemoving(true);
    try {
      await fetch(`/api/retention/legal-holds/${holdId}/entities/${entityId}/conditions/${condition.conditionId}`, { method: "DELETE" });
      onRemoved();
    } finally {
      setRemoving(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
      {condition.attributeName} = &quot;{condition.valueText}&quot;
      <button onClick={remove} disabled={removing} className="text-amber-500 hover:text-red-600 leading-none font-sans font-bold">×</button>
    </span>
  );
}

function AddConditionForm({ holdId, entityId, onAdded }: { holdId: number; entityId: number; onAdded: () => void }) {
  const [columns, setColumns] = useState<ColumnResult[]>([]);
  const [attributeId, setAttributeId] = useState<number | "">("");
  const [valueText, setValueText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/catalog/entities/${entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setColumns).catch(() => {});
  }, [entityId]);

  async function submit() {
    if (!attributeId || !valueText.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/retention/legal-holds/${holdId}/entities/${entityId}/conditions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeId, valueText: valueText.trim() }),
      });
      if (r.ok) { setValueText(""); onAdded(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <select className="input-sm text-[11px]" value={attributeId} onChange={(e) => setAttributeId(e.target.value ? Number(e.target.value) : "")}>
        <option value="">Column…</option>
        {columns.map((c) => <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}</option>)}
      </select>
      <span className="text-[11px] text-muted">=</span>
      <input
        className="input-sm text-[11px] flex-1"
        placeholder="value"
        value={valueText}
        onChange={(e) => setValueText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <button onClick={submit} disabled={saving || !attributeId || !valueText.trim()} className="text-[11px] text-brand-purple hover:underline font-medium shrink-0">
        + Add
      </button>
    </div>
  );
}

function DrivingTableCard({ holdId, entity, onChange }: { holdId: number; entity: HoldEntity; onChange: () => void }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadEstimate = useCallback(() => {
    if (entity.conditions.length === 0) { setEstimate(null); return; }
    fetch(`/api/retention/legal-holds/${holdId}/entities/${entity.entityId}/estimate`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [holdId, entity.entityId, entity.conditions.length]);

  useEffect(() => { loadEstimate(); }, [loadEstimate]);

  async function removeTable() {
    setRemoving(true);
    try {
      await fetch(`/api/retention/legal-holds/${holdId}/entities/${entity.entityId}`, { method: "DELETE" });
      onChange();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink truncate">{entity.entityName}</div>
          <div className="text-[10px] text-muted">{entity.sourceName} · {entity.schemaName}</div>
          {entity.keyAttributeName && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-brand-purple/10 text-brand-purple rounded">
              Key: {entity.keyAttributeName}
            </span>
          )}
        </div>
        <button onClick={removeTable} disabled={removing} className="shrink-0 text-[11px] text-muted hover:text-red-600">Remove</button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {entity.conditions.map((c) => (
          <ConditionRow key={c.conditionId} holdId={holdId} entityId={entity.entityId} condition={c} onRemoved={onChange} />
        ))}
        {entity.conditions.length === 0 && (
          <span className="text-[11px] text-muted italic">No conditions yet — this table is attached but no records are excluded.</span>
        )}
      </div>
      {entity.conditions.length > 1 && (
        <p className="text-[10px] text-muted mt-1">Conditions are OR'd — a record matching any one of them is under hold.</p>
      )}

      <AddConditionForm holdId={holdId} entityId={entity.entityId} onAdded={() => { onChange(); loadEstimate(); }} />

      {estimate && (
        <div className="mt-2 text-[11px]">
          {estimate.available
            ? <span className="text-amber-700 font-medium">≈ {estimate.count.toLocaleString()} record{estimate.count !== 1 ? "s" : ""} currently match — excluded from retention purge</span>
            : <span className="text-muted italic">{estimate.reason}</span>}
        </div>
      )}
    </div>
  );
}

export function LegalHoldEntitiesPanel({ holdId }: { holdId: number }) {
  const [entities, setEntities] = useState<HoldEntity[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/retention/legal-holds/${holdId}/entities`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntities)
      .catch(() => setEntities([]));
  }, [holdId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mt-3 pt-3 border-t border-line-soft/60">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Driving Tables</span>
        <button onClick={() => setShowAdd(true)} className="text-[11px] text-brand-purple hover:underline font-medium">+ Add Table</button>
      </div>

      {entities == null ? (
        <div className="text-[11px] text-muted">Loading…</div>
      ) : entities.length === 0 ? (
        <div className="text-[12px] text-muted italic">
          No driving tables yet — add one and a natural key to define which records this hold protects.
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((e) => (
            <DrivingTableCard key={e.entityId} holdId={holdId} entity={e} onChange={load} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddDrivingTableModal holdId={holdId} onClose={() => setShowAdd(false)} onAdded={load} />
      )}
    </div>
  );
}
