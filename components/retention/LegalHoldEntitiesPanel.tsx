"use client";

import { useState, useEffect, useCallback } from "react";
import { EntitySearchPicker, type EntitySearchResult } from "@/components/ui/EntitySearchPicker";

type ColumnResult = { attributeId: number; physicalName: string; friendlyName: string | null; dataType: string; isPrimaryKey: boolean; isPii: boolean };
type ConditionOperator =
  | "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "GREATER_OR_EQUAL"
  | "LESS_THAN" | "LESS_OR_EQUAL" | "BETWEEN" | "CONTAINS" | "IN_LIST"
  | "IS_NULL" | "IS_NOT_NULL";
type Condition = {
  conditionId: number; attributeId: number; attributeName: string;
  valueText: string; valueText2: string | null; operator: ConditionOperator; logicOperator: "AND" | "OR";
};
type HoldEntity = {
  entityId: number; entityName: string; schemaName: string; sourceName: string;
  keyAttributeId: number | null; keyAttributeName: string | null;
  conditions: Condition[];
};
type Estimate = { available: true; count: number } | { available: false; reason: string };

// Column data types are inconsistent across sources — e.g. numeric(12,2),
// NUMBER(10), int8, dateTime, varchar(100) all appear in the live catalog —
// so this is a loose, case-insensitive classifier, not an exact match.
type TypeFamily = "TEXT" | "NUMERIC" | "DATE" | "BOOLEAN";
function classifyDataType(dataType: string): TypeFamily {
  const t = dataType.toLowerCase();
  if (t.includes("bool")) return "BOOLEAN";
  if (t.includes("date") || t.includes("time")) return "DATE";
  if (/(int|numeric|decimal|number|double|float|real|money)/.test(t)) return "NUMERIC";
  return "TEXT";
}

const OPERATORS_BY_FAMILY: Record<TypeFamily, { value: ConditionOperator; label: string }[]> = {
  TEXT: [
    { value: "EQUALS", label: "=" }, { value: "NOT_EQUALS", label: "≠" },
    { value: "CONTAINS", label: "contains" }, { value: "IN_LIST", label: "in list (comma-separated)" },
    { value: "IS_NULL", label: "is empty" }, { value: "IS_NOT_NULL", label: "is not empty" },
  ],
  NUMERIC: [
    { value: "EQUALS", label: "=" }, { value: "NOT_EQUALS", label: "≠" },
    { value: "GREATER_THAN", label: ">" }, { value: "GREATER_OR_EQUAL", label: "≥" },
    { value: "LESS_THAN", label: "<" }, { value: "LESS_OR_EQUAL", label: "≤" },
    { value: "BETWEEN", label: "between" },
    { value: "IS_NULL", label: "is empty" }, { value: "IS_NOT_NULL", label: "is not empty" },
  ],
  DATE: [
    { value: "EQUALS", label: "on" }, { value: "NOT_EQUALS", label: "not on" },
    { value: "GREATER_THAN", label: "after" }, { value: "GREATER_OR_EQUAL", label: "on or after" },
    { value: "LESS_THAN", label: "before" }, { value: "LESS_OR_EQUAL", label: "on or before" },
    { value: "BETWEEN", label: "between" },
    { value: "IS_NULL", label: "is empty" }, { value: "IS_NOT_NULL", label: "is not empty" },
  ],
  BOOLEAN: [
    { value: "EQUALS", label: "=" },
    { value: "IS_NULL", label: "is empty" }, { value: "IS_NOT_NULL", label: "is not empty" },
  ],
};
const NO_VALUE_OPERATORS: ConditionOperator[] = ["IS_NULL", "IS_NOT_NULL"];

function operatorLabel(op: ConditionOperator, family: TypeFamily): string {
  return OPERATORS_BY_FAMILY[family].find((o) => o.value === op)?.label
    ?? OPERATORS_BY_FAMILY.TEXT.find((o) => o.value === op)?.label ?? op;
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
              <EntitySearchPicker onSelect={setEntity} />
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

function ConditionRow({ holdId, entityId, condition, isFirst, dataType, onRemoved }: {
  holdId: number; entityId: number; condition: Condition; isFirst: boolean; dataType: string; onRemoved: () => void;
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
  const family = classifyDataType(dataType);
  const opLabel = operatorLabel(condition.operator, family);
  const showsValue = !NO_VALUE_OPERATORS.includes(condition.operator);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
      {!isFirst && <span className="font-sans font-bold text-amber-600">{condition.logicOperator}</span>}
      {condition.attributeName} {opLabel}
      {showsValue && <>&quot;{condition.valueText}&quot;{condition.operator === "BETWEEN" && <> and &quot;{condition.valueText2}&quot;</>}</>}
      <button onClick={remove} disabled={removing} className="text-amber-500 hover:text-red-600 leading-none font-sans font-bold">×</button>
    </span>
  );
}

function AddConditionForm({ holdId, entityId, hasExisting, onAdded }: {
  holdId: number; entityId: number; hasExisting: boolean; onAdded: () => void;
}) {
  const [columns, setColumns] = useState<ColumnResult[]>([]);
  const [attributeId, setAttributeId] = useState<number | "">("");
  const [operator, setOperator] = useState<ConditionOperator>("EQUALS");
  const [valueText, setValueText] = useState("");
  const [valueText2, setValueText2] = useState("");
  const [logicOperator, setLogicOperator] = useState<"AND" | "OR">("OR");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/catalog/entities/${entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setColumns).catch(() => {});
  }, [entityId]);

  const selectedColumn = columns.find((c) => c.attributeId === attributeId);
  const family = selectedColumn ? classifyDataType(selectedColumn.dataType) : "TEXT";
  const needsValue = !NO_VALUE_OPERATORS.includes(operator);
  const needsSecondValue = operator === "BETWEEN";
  const canSubmit = !!attributeId && (!needsValue || !!valueText.trim()) && (!needsSecondValue || !!valueText2.trim());

  useEffect(() => {
    // Reset to a valid operator whenever the column (and therefore its type family) changes.
    setOperator("EQUALS");
  }, [attributeId]);

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/retention/legal-holds/${holdId}/entities/${entityId}/conditions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributeId, operator,
          valueText: needsValue ? valueText.trim() : "",
          valueText2: needsSecondValue ? valueText2.trim() : null,
          logicOperator: hasExisting ? logicOperator : "OR",
        }),
      });
      if (r.ok) { setValueText(""); setValueText2(""); onAdded(); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {hasExisting && (
        <select className="input-sm text-[11px] font-bold" value={logicOperator} onChange={(e) => setLogicOperator(e.target.value as "AND" | "OR")}>
          <option value="OR">OR</option>
          <option value="AND">AND</option>
        </select>
      )}
      <select className="input-sm text-[11px]" value={attributeId} onChange={(e) => setAttributeId(e.target.value ? Number(e.target.value) : "")}>
        <option value="">Column…</option>
        {columns.map((c) => (
          <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}{c.isPii ? " (PII)" : ""}</option>
        ))}
      </select>
      <select className="input-sm text-[11px]" value={operator} onChange={(e) => setOperator(e.target.value as ConditionOperator)} disabled={!attributeId}>
        {OPERATORS_BY_FAMILY[family].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {needsValue && (
        <input
          className="input-sm text-[11px] flex-1 min-w-[80px]"
          placeholder="value"
          value={valueText}
          onChange={(e) => setValueText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      )}
      {needsSecondValue && (
        <>
          <span className="text-[11px] text-muted">and</span>
          <input
            className="input-sm text-[11px] flex-1 min-w-[80px]"
            placeholder="value 2"
            value={valueText2}
            onChange={(e) => setValueText2(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </>
      )}
      <button onClick={submit} disabled={saving || !canSubmit} className="text-[11px] text-brand-purple hover:underline font-medium shrink-0">
        + Add
      </button>
    </div>
  );
}

function DrivingTableCard({ holdId, entity, onChange }: { holdId: number; entity: HoldEntity; onChange: () => void }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [removing, setRemoving] = useState(false);
  const [dataTypeByAttr, setDataTypeByAttr] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch(`/api/catalog/entities/${entity.entityId}/columns`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cols: ColumnResult[]) => {
        setDataTypeByAttr(Object.fromEntries(cols.map((c) => [c.attributeId, c.dataType])));
      })
      .catch(() => {});
  }, [entity.entityId]);

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
        {entity.conditions.map((c, i) => (
          <ConditionRow
            key={c.conditionId} holdId={holdId} entityId={entity.entityId} condition={c}
            isFirst={i === 0} dataType={dataTypeByAttr[c.attributeId] ?? "text"} onRemoved={onChange}
          />
        ))}
        {entity.conditions.length === 0 && (
          <span className="text-[11px] text-muted italic">No conditions yet — this table is attached but no records are excluded.</span>
        )}
      </div>
      {entity.conditions.length > 1 && (
        <p className="text-[10px] text-muted mt-1">Conditions combine left to right using the AND/OR shown on each one.</p>
      )}

      <AddConditionForm holdId={holdId} entityId={entity.entityId} hasExisting={entity.conditions.length > 0} onAdded={() => { onChange(); loadEstimate(); }} />

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
