"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import type { DataCategory, RetentionSchedule } from "@/lib/types";
import { EntitySearchPicker, type EntitySearchResult } from "@/components/ui/EntitySearchPicker";

// ── Sensitivity badge ─────────────────────────────────────────────────────────

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC:       "bg-green-100 text-green-700",
  INTERNAL:     "bg-blue-100 text-blue-700",
  CONFIDENTIAL: "bg-amber-100 text-amber-700",
  RESTRICTED:   "bg-red-100 text-red-700",
  SECRET:       "bg-purple-100 text-purple-700",
  TOP_SECRET:   "bg-gray-800 text-white",
};

function SensitivityBadge({ value }: { value: string }) {
  const cls = SENSITIVITY_COLORS[value] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${cls}`}>
      {value}
    </span>
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  DELETE:     "bg-red-50 text-red-600",
  ANONYMIZE:  "bg-purple-50 text-purple-600",
  ARCHIVE:    "bg-sky-50 text-sky-600",
  REVIEW:     "bg-amber-50 text-amber-600",
  SCRAMBLE:   "bg-fuchsia-50 text-fuchsia-600",
};

function ActionBadge({ value }: { value: string }) {
  const cls = ACTION_COLORS[value] ?? "bg-gray-50 text-gray-600";
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${cls}`}>{value}</span>
  );
}

// ── Schedule panel ────────────────────────────────────────────────────────────

function SchedulePanel({ category }: { category: DataCategory }) {
  const { t } = useLang();
  const r = t.retention;
  const [schedules, setSchedules] = useState<RetentionSchedule[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    jurisdiction: "",
    triggerEvent: "",
    retentionPeriod: "5",
    retentionUnit: "YEARS",
    postRetentionAction: "DELETE",
    regulatoryReference: "",
    notes: "",
    isDefault: false,
    scrambleTechnique: "",
    scrambleDetails: "",
  });

  const load = useCallback(() => {
    fetch(`/api/retention/schedules/${category.categoryId}`)
      .then((r) => r.json())
      .then(setSchedules)
      .catch(() => setSchedules([]));
  }, [category.categoryId]);

  useEffect(() => { load(); }, [load]);

  async function saveSchedule() {
    if (!form.jurisdiction || !form.triggerEvent) return;
    setSaving(true);
    const automationConfigJson = form.postRetentionAction === "SCRAMBLE" && (form.scrambleTechnique || form.scrambleDetails)
      ? { technique: form.scrambleTechnique || undefined, details: form.scrambleDetails || undefined }
      : null;
    await fetch(`/api/retention/schedules/${category.categoryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, retentionPeriod: Number(form.retentionPeriod), automationConfigJson }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ jurisdiction: "", triggerEvent: "", retentionPeriod: "5", retentionUnit: "YEARS", postRetentionAction: "DELETE", regulatoryReference: "", notes: "", isDefault: false, scrambleTechnique: "", scrambleDetails: "" });
    load();
  }

  async function deleteSchedule(scheduleId: number) {
    await fetch(`/api/retention/schedules/${category.categoryId}?scheduleId=${scheduleId}`, { method: "DELETE" });
    load();
  }

  const unitLabel: Record<string, string> = { DAYS: r.unitDays, MONTHS: r.unitMonths, YEARS: r.unitYears };

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-brand-deep">{r.schedulesTitle}</span>
        <button
          className="text-[10px] px-2 py-1 rounded bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20"
          onClick={() => setShowAdd((v) => !v)}
        >
          + {r.addSchedule}
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-line text-[11px] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input-sm" placeholder={r.jurisdiction} value={form.jurisdiction} onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))} />
            <input className="input-sm" placeholder={r.triggerEvent} value={form.triggerEvent} onChange={(e) => setForm((f) => ({ ...f, triggerEvent: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" className="input-sm" placeholder={r.period} value={form.retentionPeriod} onChange={(e) => setForm((f) => ({ ...f, retentionPeriod: e.target.value }))} />
            <select className="input-sm" value={form.retentionUnit} onChange={(e) => setForm((f) => ({ ...f, retentionUnit: e.target.value }))}>
              <option value="DAYS">{r.unitDays}</option>
              <option value="MONTHS">{r.unitMonths}</option>
              <option value="YEARS">{r.unitYears}</option>
            </select>
            <select className="input-sm" value={form.postRetentionAction} onChange={(e) => setForm((f) => ({ ...f, postRetentionAction: e.target.value }))}>
              <option value="DELETE">{r.actionDelete}</option>
              <option value="ANONYMIZE">{r.actionAnonymize}</option>
              <option value="ARCHIVE">{r.actionArchive}</option>
              <option value="REVIEW">{r.actionReview}</option>
              <option value="SCRAMBLE">{r.actionScramble}</option>
            </select>
          </div>
          {form.postRetentionAction === "SCRAMBLE" && (
            <div className="grid grid-cols-2 gap-2">
              <input className="input-sm" placeholder={r.scrambleTechnique} value={form.scrambleTechnique} onChange={(e) => setForm((f) => ({ ...f, scrambleTechnique: e.target.value }))} />
              <input className="input-sm" placeholder={r.scrambleDetails} value={form.scrambleDetails} onChange={(e) => setForm((f) => ({ ...f, scrambleDetails: e.target.value }))} />
            </div>
          )}
          <input className="input-sm w-full" placeholder={r.reference} value={form.regulatoryReference} onChange={(e) => setForm((f) => ({ ...f, regulatoryReference: e.target.value }))} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
              <span>{r.defaultSchedule}</span>
            </label>
            <div className="flex-1" />
            <button className="btn-secondary text-[10px] py-1" onClick={() => setShowAdd(false)}>{t.common.cancel}</button>
            <button className="btn-primary text-[10px] py-1" disabled={saving} onClick={saveSchedule}>
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      )}

      {schedules == null ? (
        <div className="text-[11px] text-muted">{t.common.loading}</div>
      ) : schedules.length === 0 ? (
        <div className="text-[11px] text-muted italic">{r.noSchedules}</div>
      ) : (
        <div className="space-y-1.5">
          {schedules.map((s) => (
            <div key={s.scheduleId} className="flex items-start gap-2 p-2 bg-white rounded border border-line group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-brand-purple">{s.jurisdiction}</span>
                  {s.isDefault && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                      {r.defaultSchedule}
                    </span>
                  )}
                  <ActionBadge value={s.postRetentionAction} />
                </div>
                <div className="text-[10px] text-ink mt-0.5">
                  {s.triggerEvent} → {s.retentionPeriod} {unitLabel[s.retentionUnit] ?? s.retentionUnit}
                </div>
                {s.regulatoryReference && (
                  <div className="text-[9px] text-muted mt-0.5">{s.regulatoryReference}</div>
                )}
                {s.automationConfigJson?.technique && (
                  <div className="text-[9px] text-fuchsia-700 mt-0.5">{r.scrambleTechnique}: {s.automationConfigJson.technique}</div>
                )}
              </div>
              <button
                className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-600 shrink-0"
                onClick={() => deleteSchedule(s.scheduleId)}
                title={r.deleteSchedule}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tables panel ──────────────────────────────────────────────────────────────

type ColumnResult = { attributeId: number; physicalName: string; friendlyName: string | null; isPrimaryKey: boolean; isPii: boolean };
type CategoryEntity = {
  entityId: number; entityName: string; schemaName: string; sourceName: string;
  keyAttributeId: number | null; keyAttributeName: string | null; cascadeEnabled: boolean; isMaster: boolean;
};

function AssignedTableCard({ categoryId, entity, onChange }: {
  categoryId: number; entity: CategoryEntity; onChange: () => void;
}) {
  const [columns, setColumns] = useState<ColumnResult[]>([]);
  const [keyAttributeId, setKeyAttributeId] = useState<number | "">(entity.keyAttributeId ?? "");
  const [cascadeEnabled, setCascadeEnabled] = useState(entity.cascadeEnabled);
  const [isMaster, setIsMaster] = useState(entity.isMaster);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = keyAttributeId !== (entity.keyAttributeId ?? "") || cascadeEnabled !== entity.cascadeEnabled || isMaster !== entity.isMaster;

  useEffect(() => {
    fetch(`/api/catalog/entities/${entity.entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setColumns).catch(() => {});
  }, [entity.entityId]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/entities/${entity.entityId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyAttributeId: keyAttributeId || null, cascadeEnabled, isMaster }),
      });
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/entities/${entity.entityId}`, { method: "DELETE" });
      onChange();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-2.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink truncate flex items-center gap-1.5">
            {entity.entityName}
            {entity.isMaster && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-purple text-white">MASTER</span>}
          </div>
          <div className="text-[10px] text-muted">{entity.sourceName} · {entity.schemaName}</div>
        </div>
        <button onClick={remove} disabled={removing} className="shrink-0 text-[11px] text-muted hover:text-red-600">Remove</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select className="input-sm text-[11px]" value={keyAttributeId} onChange={(e) => setKeyAttributeId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">— ID column —</option>
          {columns.map((c) => (
            <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}{c.isPii ? " (PII)" : ""}{c.isPrimaryKey ? " (PK)" : ""}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
          <input type="checkbox" checked={cascadeEnabled} onChange={(e) => setCascadeEnabled(e.target.checked)} />
          Cascade
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none">
          <input type="checkbox" checked={isMaster} onChange={(e) => setIsMaster(e.target.checked)} />
          Is Master (identity root)
        </label>
        {dirty && (
          <button onClick={save} disabled={saving} className="text-[11px] text-brand-purple hover:underline font-medium">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

function TablesPanel({ category }: { category: DataCategory }) {
  const [entities, setEntities] = useState<CategoryEntity[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/retention/categories/${category.categoryId}/entities`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntities)
      .catch(() => setEntities([]));
  }, [category.categoryId]);

  useEffect(() => { load(); }, [load]);

  async function addTable(e: EntitySearchResult) {
    setShowAdd(false);
    await fetch(`/api/retention/categories/${category.categoryId}/entities`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: e.entityId, keyAttributeId: null, cascadeEnabled: false }),
    });
    load();
  }

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-brand-deep">Tables</span>
        <button
          className="text-[10px] px-2 py-1 rounded bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20"
          onClick={() => setShowAdd((v) => !v)}
        >
          + Add Table
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-line">
          <EntitySearchPicker onSelect={addTable} showPiiFilter />
        </div>
      )}

      {entities == null ? (
        <div className="text-[11px] text-muted">Loading…</div>
      ) : entities.length === 0 ? (
        <div className="text-[11px] text-muted italic">No tables assigned yet.</div>
      ) : (
        <div className="space-y-1.5">
          {entities.map((e) => (
            <AssignedTableCard key={e.entityId} categoryId={category.categoryId} entity={e} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Relationships panel ────────────────────────────────────────────────────────

type RetentionRelationship = {
  relationshipId: number; categoryId: number;
  parentEntityId: number; parentEntityName: string; parentAttributeName: string;
  childEntityId: number; childEntityName: string; childAttributeName: string;
  joinConditionText: string | null;
  discoveryMethod: "SUGGESTED_FK" | "MANUAL";
  isActive: boolean; createdAt: string;
};
type RelationshipCandidate = {
  parentEntityId: number; parentAttributeId: number; parentAttributeName: string;
  childEntityId: number; childEntityName: string; childSchemaName: string; childSourceName: string;
  childAttributeId: number; childAttributeName: string;
  sourceLinkId: number; discoveryMethod: "INTROSPECTED" | "NAME_INFERRED" | "MANUAL";
};

function SuggestionRow({ categoryId, candidate, onRegistered }: {
  categoryId: number; candidate: RelationshipCandidate; onRegistered: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [joinConditionText, setJoinConditionText] = useState("");
  const [saving, setSaving] = useState(false);

  async function register() {
    setSaving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/relationships`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentEntityId: candidate.parentEntityId, parentAttributeId: candidate.parentAttributeId,
          childEntityId: candidate.childEntityId, childAttributeId: candidate.childAttributeId,
          discoveryMethod: "SUGGESTED_FK", sourceLinkId: candidate.sourceLinkId,
          joinConditionText: joinConditionText.trim() || null,
        }),
      });
      onRegistered();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-line-soft bg-canvas p-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-ink">
          {candidate.childEntityName}.{candidate.childAttributeName} <span className="text-muted">→</span> {candidate.parentAttributeName}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">{candidate.discoveryMethod}</span>
          <button onClick={() => setShowForm((v) => !v)} className="text-brand-purple hover:underline font-medium">
            {showForm ? "Cancel" : "Register"}
          </button>
        </div>
      </div>
      {showForm && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            className="input-sm text-[11px] flex-1"
            placeholder="Join condition (optional — beyond a plain column match)"
            value={joinConditionText}
            onChange={(e) => setJoinConditionText(e.target.value)}
          />
          <button onClick={register} disabled={saving} className="text-brand-purple hover:underline font-medium shrink-0">
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}

function RegisteredRelationshipRow({ categoryId, rel, onChange }: {
  categoryId: number; rel: RetentionRelationship; onChange: () => void;
}) {
  const [joinConditionText, setJoinConditionText] = useState(rel.joinConditionText ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = joinConditionText !== (rel.joinConditionText ?? "");

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/relationships/${rel.relationshipId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinConditionText: joinConditionText.trim() || null }),
      });
      onChange();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    await fetch(`/api/retention/categories/${categoryId}/relationships/${rel.relationshipId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rel.isActive }),
    });
    onChange();
  }

  async function remove() {
    setRemoving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/relationships/${rel.relationshipId}`, { method: "DELETE" });
      onChange();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={`rounded-md border p-2 text-[11px] ${rel.isActive ? "border-line bg-white" : "border-line-soft bg-canvas opacity-60"}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono text-ink">
          {rel.parentEntityName}.{rel.parentAttributeName} <span className="text-muted">←</span> {rel.childEntityName}.{rel.childAttributeName}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-line">{rel.discoveryMethod}</span>
          <button onClick={toggleActive} className="text-muted hover:text-brand-purple">{rel.isActive ? "Deactivate" : "Activate"}</button>
          <button onClick={remove} disabled={removing} className="text-muted hover:text-red-600">Delete</button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className="input-sm text-[11px] flex-1"
          placeholder="Join condition (optional)"
          value={joinConditionText}
          onChange={(e) => setJoinConditionText(e.target.value)}
        />
        {dirty && (
          <button onClick={save} disabled={saving} className="text-brand-purple hover:underline font-medium shrink-0">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}

function AddManualRelationshipForm({ categoryId, onAdded }: { categoryId: number; onAdded: () => void }) {
  const [parentEntity, setParentEntity] = useState<EntitySearchResult | null>(null);
  const [childEntity, setChildEntity] = useState<EntitySearchResult | null>(null);
  const [parentColumns, setParentColumns] = useState<ColumnResult[]>([]);
  const [childColumns, setChildColumns] = useState<ColumnResult[]>([]);
  const [parentAttributeId, setParentAttributeId] = useState<number | "">("");
  const [childAttributeId, setChildAttributeId] = useState<number | "">("");
  const [joinConditionText, setJoinConditionText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!parentEntity) { setParentColumns([]); return; }
    fetch(`/api/catalog/entities/${parentEntity.entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setParentColumns).catch(() => {});
  }, [parentEntity]);
  useEffect(() => {
    if (!childEntity) { setChildColumns([]); return; }
    fetch(`/api/catalog/entities/${childEntity.entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setChildColumns).catch(() => {});
  }, [childEntity]);

  const canSubmit = parentEntity && childEntity && parentAttributeId && childAttributeId;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await fetch(`/api/retention/categories/${categoryId}/relationships`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentEntityId: parentEntity!.entityId, parentAttributeId,
          childEntityId: childEntity!.entityId, childAttributeId,
          discoveryMethod: "MANUAL", joinConditionText: joinConditionText.trim() || null,
        }),
      });
      setParentEntity(null); setChildEntity(null); setParentAttributeId(""); setChildAttributeId(""); setJoinConditionText("");
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-line space-y-2 text-[11px]">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted mb-1">Parent (master side)</label>
          {parentEntity ? (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-line rounded">
              <span className="flex-1 truncate">{parentEntity.entityName}</span>
              <button onClick={() => setParentEntity(null)} className="text-muted hover:text-red-500">&times;</button>
            </div>
          ) : <EntitySearchPicker onSelect={setParentEntity} />}
          {parentEntity && (
            <select className="input-sm w-full mt-1.5" value={parentAttributeId} onChange={(e) => setParentAttributeId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— column —</option>
              {parentColumns.map((c) => <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Child</label>
          {childEntity ? (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-line rounded">
              <span className="flex-1 truncate">{childEntity.entityName}</span>
              <button onClick={() => setChildEntity(null)} className="text-muted hover:text-red-500">&times;</button>
            </div>
          ) : <EntitySearchPicker onSelect={setChildEntity} />}
          {childEntity && (
            <select className="input-sm w-full mt-1.5" value={childAttributeId} onChange={(e) => setChildAttributeId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">— column —</option>
              {childColumns.map((c) => <option key={c.attributeId} value={c.attributeId}>{c.friendlyName ?? c.physicalName}</option>)}
            </select>
          )}
        </div>
      </div>
      <input
        className="input-sm w-full"
        placeholder="Join condition (optional — beyond a plain column match)"
        value={joinConditionText}
        onChange={(e) => setJoinConditionText(e.target.value)}
      />
      <button onClick={submit} disabled={!canSubmit || saving} className="btn-primary text-[11px] py-1">
        {saving ? "Adding…" : "Add Relationship"}
      </button>
    </div>
  );
}

function RelationshipsPanel({ category }: { category: DataCategory }) {
  const [entities, setEntities] = useState<CategoryEntity[] | null>(null);
  const [relationships, setRelationships] = useState<RetentionRelationship[] | null>(null);
  const [suggestionsByMaster, setSuggestionsByMaster] = useState<Record<number, RelationshipCandidate[]>>({});
  const [showManualForm, setShowManualForm] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/retention/categories/${category.categoryId}/entities`).then((r) => (r.ok ? r.json() : [])).then(setEntities).catch(() => setEntities([]));
    fetch(`/api/retention/categories/${category.categoryId}/relationships`).then((r) => (r.ok ? r.json() : [])).then(setRelationships).catch(() => setRelationships([]));
  }, [category.categoryId]);

  useEffect(() => { load(); }, [load]);

  const masters = (entities ?? []).filter((e) => e.isMaster);
  const visitedEntityIds = [
    ...(entities ?? []).map((e) => e.entityId),
    ...(relationships ?? []).flatMap((r) => [r.parentEntityId, r.childEntityId]),
  ];

  async function findSuggestions(masterEntityId: number) {
    const exclude = visitedEntityIds.filter((id) => id !== masterEntityId);
    const res = await fetch(`/api/retention/categories/${category.categoryId}/relationships/suggestions?fromEntityId=${masterEntityId}&exclude=${exclude.join(",")}`);
    const rows: RelationshipCandidate[] = res.ok ? await res.json() : [];
    setSuggestionsByMaster((prev) => ({ ...prev, [masterEntityId]: rows }));
  }

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-brand-deep">Relationships</span>
        <button
          className="text-[10px] px-2 py-1 rounded bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20"
          onClick={() => setShowManualForm((v) => !v)}
        >
          {showManualForm ? "Cancel" : "+ Add Manual Relationship"}
        </button>
      </div>

      {showManualForm && (
        <div className="mb-3">
          <AddManualRelationshipForm categoryId={category.categoryId} onAdded={() => { setShowManualForm(false); load(); }} />
        </div>
      )}

      {masters.length === 0 && (
        <p className="text-[11px] text-muted italic mb-2">
          Mark a table as &quot;Is Master&quot; in the Tables panel to discover relationships from its foreign-key graph.
        </p>
      )}
      {masters.map((m) => (
        <div key={m.entityId} className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">Suggestions from {m.entityName}</span>
            <button onClick={() => findSuggestions(m.entityId)} className="text-[10px] text-brand-purple hover:underline font-medium">
              Find relationships
            </button>
          </div>
          {suggestionsByMaster[m.entityId] && (
            suggestionsByMaster[m.entityId].length === 0 ? (
              <p className="text-[11px] text-muted italic">No new candidates found.</p>
            ) : (
              <div className="space-y-1.5">
                {suggestionsByMaster[m.entityId].map((c) => (
                  <SuggestionRow
                    key={`${c.childEntityId}:${c.childAttributeId}`} categoryId={category.categoryId} candidate={c}
                    onRegistered={() => { load(); findSuggestions(m.entityId); }}
                  />
                ))}
              </div>
            )
          )}
        </div>
      ))}

      <div className="mt-2">
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1.5">Registered</span>
        {relationships == null ? (
          <div className="text-[11px] text-muted">Loading…</div>
        ) : relationships.length === 0 ? (
          <div className="text-[11px] text-muted italic">No relationships registered yet.</div>
        ) : (
          <div className="space-y-1.5">
            {relationships.map((rel) => (
              <RegisteredRelationshipRow key={rel.relationshipId} categoryId={category.categoryId} rel={rel} onChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  depth = 0,
  onAdded,
}: {
  category: DataCategory;
  depth?: number;
  onAdded: () => void;
}) {
  const { t, isRtl, lang } = useLang();
  const r = t.retention;
  const [open, setOpen] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [showRelationships, setShowRelationships] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", sensitivity: "INTERNAL" });
  const [saving, setSaving] = useState(false);

  const displayName = pickTranslation(category.name, category.nameTranslations, lang);

  async function addSubcategory() {
    if (!subForm.name) return;
    setSaving(true);
    await fetch("/api/retention/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subForm, parentId: category.categoryId }),
    });
    setSaving(false);
    setShowAddSub(false);
    setSubForm({ name: "", sensitivity: "INTERNAL" });
    onAdded();
  }

  return (
    <div className={depth > 0 ? (isRtl ? "mr-4 border-r border-line-soft pr-3" : "ml-4 border-l border-line-soft pl-3") : ""}>
      {/* Row header */}
      <div className="flex items-center gap-2 py-2 group">
        <button
          className="text-[11px] text-muted w-4 shrink-0"
          onClick={() => setOpen((v) => !v)}
        >
          {(category.children?.length ?? 0) > 0 ? (open ? "▼" : "▶") : "·"}
        </button>
        <span className="flex-1 text-[12px] font-medium text-ink truncate" title={displayName}>
          {displayName}
        </span>
        <SensitivityBadge value={category.sensitivity} />
        <span className="text-[10px] text-muted">{category.scheduleCount ?? 0} {r.schedules}</span>
        <span className="text-[10px] text-muted">{category.entityCount ?? 0} {r.entities}</span>
        <button
          className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-purple"
          onClick={() => setShowSchedules((v) => !v)}
        >
          {r.schedulesTitle}
        </button>
        <button
          className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-purple"
          onClick={() => setShowTables((v) => !v)}
        >
          Tables
        </button>
        <button
          className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-purple"
          onClick={() => setShowRelationships((v) => !v)}
        >
          Relationships
        </button>
        {depth === 0 && (
          <button
            className="opacity-0 group-hover:opacity-100 text-[10px] text-brand-purple"
            onClick={() => setShowAddSub((v) => !v)}
          >
            + {r.addSubcategory}
          </button>
        )}
      </div>

      {/* Schedules panel */}
      {showSchedules && <SchedulePanel category={category} />}

      {/* Tables panel */}
      {showTables && <TablesPanel category={category} />}

      {/* Relationships panel */}
      {showRelationships && <RelationshipsPanel category={category} />}

      {/* Add subcategory inline form */}
      {showAddSub && (
        <div className="mb-2 p-2.5 bg-gray-50 rounded-lg border border-line text-[11px] space-y-2">
          <input className="input-sm w-full" placeholder={r.categoryName} value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="flex items-center gap-2">
            <select className="input-sm flex-1" value={subForm.sensitivity} onChange={(e) => setSubForm((f) => ({ ...f, sensitivity: e.target.value }))}>
              <option value="PUBLIC">{r.sensitivityPublic}</option>
              <option value="INTERNAL">{r.sensitivityInternal}</option>
              <option value="CONFIDENTIAL">{r.sensitivityConfidential}</option>
              <option value="RESTRICTED">{r.sensitivityRestricted}</option>
              <option value="SECRET">{r.sensitivitySecret}</option>
              <option value="TOP_SECRET">{r.sensitivityTopSecret}</option>
            </select>
            <button className="btn-secondary text-[10px] py-1" onClick={() => setShowAddSub(false)}>{t.common.cancel}</button>
            <button className="btn-primary text-[10px] py-1" disabled={saving} onClick={addSubcategory}>
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Children */}
      {open && category.children?.map((child) => (
        <CategoryRow key={child.categoryId} category={child} depth={depth + 1} onAdded={onAdded} />
      ))}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function DataCategoriesTab() {
  const { t } = useLang();
  const r = t.retention;
  const [categories, setCategories] = useState<DataCategory[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", sensitivity: "INTERNAL", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/retention/categories")
      .then((res) => res.json())
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!form.name) return;
    setSaving(true);
    await fetch("/api/retention/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ name: "", sensitivity: "INTERNAL", description: "" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">{r.categoriesTitle}</h2>
          <button className="btn-primary text-[12px]" onClick={() => setShowAdd((v) => !v)}>
            + {r.addCategory}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-line text-[12px] space-y-2">
            <input className="input-sm w-full" placeholder={r.categoryName} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <p className="text-[11px] text-muted">
              Arabic and any other enabled language are added afterward in{" "}
              <Link href="/admin/languages" className="text-brand-purple hover:underline">Administration → Languages → Workbench</Link>.
            </p>
            <div className="flex items-center gap-2">
              <select className="input-sm flex-1" value={form.sensitivity} onChange={(e) => setForm((f) => ({ ...f, sensitivity: e.target.value }))}>
                <option value="PUBLIC">{r.sensitivityPublic}</option>
                <option value="INTERNAL">{r.sensitivityInternal}</option>
                <option value="CONFIDENTIAL">{r.sensitivityConfidential}</option>
                <option value="RESTRICTED">{r.sensitivityRestricted}</option>
              </select>
              <input className="input-sm flex-1" placeholder={t.common.description} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-[11px]" onClick={() => setShowAdd(false)}>{t.common.cancel}</button>
              <button className="btn-primary text-[11px]" disabled={saving} onClick={addCategory}>
                {saving ? t.common.saving : t.common.save}
              </button>
            </div>
          </div>
        )}

        {categories == null ? (
          <div className="py-8 text-center text-muted">{t.common.loading}</div>
        ) : categories.length === 0 ? (
          <div className="py-8 text-center text-muted">{r.noCategories}</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {categories.map((cat) => (
              <CategoryRow key={cat.categoryId} category={cat} onAdded={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
