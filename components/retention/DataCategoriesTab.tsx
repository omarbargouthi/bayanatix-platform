"use client";

import { useEffect, useState, useCallback } from "react";
import { useLang } from "@/lib/lang-context";
import type { DataCategory, RetentionSchedule } from "@/lib/types";

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
    await fetch(`/api/retention/schedules/${category.categoryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, retentionPeriod: Number(form.retentionPeriod) }),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ jurisdiction: "", triggerEvent: "", retentionPeriod: "5", retentionUnit: "YEARS", postRetentionAction: "DELETE", regulatoryReference: "", notes: "", isDefault: false });
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
            </select>
          </div>
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
  const { t, isRtl } = useLang();
  const r = t.retention;
  const [open, setOpen] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", nameAr: "", sensitivity: "INTERNAL" });
  const [saving, setSaving] = useState(false);

  const displayName = isRtl && category.nameAr ? category.nameAr : category.name;

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
    setSubForm({ name: "", nameAr: "", sensitivity: "INTERNAL" });
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

      {/* Add subcategory inline form */}
      {showAddSub && (
        <div className="mb-2 p-2.5 bg-gray-50 rounded-lg border border-line text-[11px] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input-sm" placeholder={r.categoryName} value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="input-sm" placeholder={r.categoryNameAr} value={subForm.nameAr} onChange={(e) => setSubForm((f) => ({ ...f, nameAr: e.target.value }))} />
          </div>
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
  const [form, setForm] = useState({ name: "", nameAr: "", sensitivity: "INTERNAL", description: "" });
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
    setForm({ name: "", nameAr: "", sensitivity: "INTERNAL", description: "" });
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
            <div className="grid grid-cols-2 gap-2">
              <input className="input-sm" placeholder={r.categoryName} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="input-sm" placeholder={r.categoryNameAr} value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
            </div>
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
