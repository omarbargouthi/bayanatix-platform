"use client";

import { useEffect, useState } from "react";
import type { RoadmapItem } from "@/lib/queries/gov-roadmap-items";
import { ROADMAP_ITEM_STATUSES, roadmapExecution, type RoadmapExecutionStatus } from "@/lib/gov-framework-sections";
import { FormDialog, FormField } from "@/components/ui/FormDialog";
import { fmtGovDate } from "./GovAnnouncements";
import { useLang } from "@/lib/lang-context";

// The execution side of a roadmap document: its milestones, the deliverables under them,
// and where each stands. The roadmap's own status and progress are worked out from them.

export type ExecutionCounts = { total: number; completed: number; started: number; late: number };

const today = () => new Date().toISOString().slice(0, 10);
const isLate = (i: { statusCode: string; dueDate: string | null }) =>
  i.statusCode === "DELAYED" || (!!i.dueDate && i.dueDate < today() && !["COMPLETED", "CANCELLED", "DELAYED"].includes(i.statusCode));

/** The counts roadmapExecution() works from; cancelled items are left out. */
export function executionCounts(items: { statusCode: string; dueDate: string | null }[]): ExecutionCounts {
  const live = items.filter((i) => i.statusCode !== "CANCELLED");
  return {
    total: live.length,
    completed: live.filter((i) => i.statusCode === "COMPLETED").length,
    started: live.filter((i) => i.statusCode === "IN_PROGRESS").length,
    late: live.filter(isLate).length,
  };
}

const EXEC_STYLE: Record<RoadmapExecutionStatus, string> = {
  NOT_TRACKED: "bg-gray-100 text-gray-500",
  NOT_STARTED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  DELAYED:     "bg-red-100 text-red-700",
  COMPLETED:   "bg-emerald-100 text-emerald-700",
};
const ITEM_STYLE: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED:   "bg-emerald-100 text-emerald-700",
  DELAYED:     "bg-red-100 text-red-700",
  ON_HOLD:     "bg-amber-100 text-amber-700",
  CANCELLED:   "bg-gray-100 text-gray-400 line-through",
};

/** The roadmap's execution status with its progress bar — also used in the documents table. */
export function ExecutionBadge({ counts, compact = false }: { counts: ExecutionCounts; compact?: boolean }) {
  const x = useLang().t.roadmapExec;
  const { status, pct } = roadmapExecution(counts);
  return (
    <div className={compact ? "min-w-[120px]" : "flex items-center gap-3 flex-wrap"}>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${EXEC_STYLE[status]}`}>{(x.execStatuses as Record<string, string>)[status]}</span>
      {counts.total > 0 && (
        <div className={`flex items-center gap-2 ${compact ? "mt-1.5" : ""}`}>
          <div className={`h-1.5 rounded-full bg-gray-200 overflow-hidden ${compact ? "w-20" : "w-40"}`}>
            <div className={`h-full rounded-full ${status === "DELAYED" ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">
            {compact ? `${pct}%` : x.progress.replace("{done}", String(counts.completed)).replace("{total}", String(counts.total))}
          </span>
        </div>
      )}
    </div>
  );
}

type ItemForm = {
  typeCode: "MILESTONE" | "DELIVERABLE"; parentItemId: string; title: string; description: string;
  statusCode: string; dueDate: string; completedDate: string; owner: string; announce: boolean;
};

export function RoadmapExecution({ docId, canManage, onChange }: {
  docId: number; canManage: boolean;
  /** Called with the fresh counts whenever the items are loaded or changed. */
  onChange?: (counts: ExecutionCounts) => void;
}) {
  const { t, lang } = useLang();
  const x = t.roadmapExec;
  const statuses = x.statuses as Record<string, string>;
  const base = `/api/governance/framework/${docId}/items`;

  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch(base);
    if (!r.ok) { setItems([]); return; }
    const list: RoadmapItem[] = (await r.json()).items;
    setItems(list);
    onChange?.(executionCounts(list));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [docId]);

  function openNew(typeCode: ItemForm["typeCode"], parentItemId?: number) {
    setForm({ typeCode, parentItemId: parentItemId ? String(parentItemId) : "", title: "", description: "", statusCode: "NOT_STARTED", dueDate: "", completedDate: "", owner: "", announce: typeCode === "MILESTONE" });
    setEditId(null); setError("");
  }
  function openEdit(i: RoadmapItem) {
    setForm({
      typeCode: i.typeCode, parentItemId: i.parentItemId ? String(i.parentItemId) : "", title: i.title, description: i.description ?? "",
      statusCode: i.statusCode, dueDate: i.dueDate ?? "", completedDate: i.completedDate ?? "", owner: i.owner ?? "", announce: i.announce,
    });
    setEditId(i.itemId); setError("");
  }
  async function save() {
    if (!form) return;
    if (!form.title.trim()) { setError(x.titleRequired); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(editId ? `${base}/${editId}` : base, {
        method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parentItemId: form.parentItemId ? Number(form.parentItemId) : null }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? x.saveFailed); return; }
      await load();
      setForm(null);
    } finally { setSaving(false); }
  }
  async function remove(i: RoadmapItem) {
    if (!confirm(x.deleteConfirm)) return;
    const r = await fetch(`${base}/${i.itemId}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm((p) => (p ? { ...p, [key]: value } : p));

  if (items === null) return <div className="text-[12px] text-muted">{t.common.loading}</div>;

  const milestones = items.filter((i) => i.typeCode === "MILESTONE");
  const under = (id: number) => items.filter((i) => i.parentItemId === id);
  const loose = items.filter((i) => i.typeCode === "DELIVERABLE" && i.parentItemId == null);

  const line = (i: RoadmapItem, nested: boolean) => (
    <li key={i.itemId} className={`flex items-start gap-3 py-2 ${nested ? "ps-7" : ""}`}>
      <span className="mt-0.5 text-[13px] shrink-0" aria-hidden>{i.typeCode === "MILESTONE" ? "◆" : "▫"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${i.typeCode === "MILESTONE" ? "font-semibold text-ink" : "text-ink"} text-[13px]`} dir="auto">{i.title}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ITEM_STYLE[i.statusCode] ?? ITEM_STYLE.NOT_STARTED}`}>{statuses[i.statusCode] ?? i.statusCode}</span>
          {isLate(i) && i.statusCode !== "DELAYED" && <span className="text-[10px] font-bold text-red-600">{x.overdue}</span>}
          {i.announce && <span className="text-[10px] text-muted">{x.onDashboard}</span>}
        </div>
        {i.description && <p className="text-[12px] text-ink-soft mt-0.5 whitespace-pre-line" dir="auto">{i.description}</p>}
        <div className="text-[11px] text-muted mt-0.5 flex gap-x-4 flex-wrap">
          {i.statusCode === "COMPLETED" && i.completedDate
            ? <span>{x.completed.replace("{date}", fmtGovDate(i.completedDate, lang))}</span>
            : i.dueDate && <span>{x.due.replace("{date}", fmtGovDate(i.dueDate, lang))}</span>}
          {i.owner && <span dir="auto">{x.fOwner}: {i.owner}</span>}
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          {i.typeCode === "MILESTONE" && <button onClick={() => openNew("DELIVERABLE", i.itemId)} className="text-[11px] text-brand-purple hover:underline">{x.addDeliverable}</button>}
          <button onClick={() => openEdit(i)} className="text-[11px] text-ink-soft hover:text-brand-purple">{t.common.edit}</button>
          <button onClick={() => remove(i)} className="text-[11px] text-ink-soft hover:text-red-500">{t.common.delete}</button>
        </div>
      )}
    </li>
  );

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-[13px] font-bold text-brand-deep">{x.title}</h3>
          <ExecutionBadge counts={executionCounts(items)} />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => openNew("MILESTONE")} className="btn btn-sm">{x.addMilestone}</button>
            <button onClick={() => openNew("DELIVERABLE")} className="btn btn-sm">{x.addDeliverable}</button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-[12px] text-muted">{x.noItems}</p>
      ) : (
        <ul className="px-4 divide-y divide-line-soft">
          {milestones.map((m) => [line(m, false), ...under(m.itemId).map((d) => line(d, true))])}
          {loose.length > 0 && milestones.length > 0 && <li className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted">{x.otherDeliverables}</li>}
          {loose.map((d) => line(d, false))}
        </ul>
      )}

      {form && (
        <FormDialog
          title={(x.dialogTitles as Record<string, string>)[`${editId ? "EDIT" : "NEW"}_${form.typeCode}`]}
          onClose={() => setForm(null)} width="w-[600px]"
          footer={<>
            <button type="button" onClick={() => setForm(null)} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? t.common.saving : t.common.save}</button>
          </>}
        >
          <FormField label={x.fTitle} required>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className="field" />
          </FormField>
          {form.typeCode === "DELIVERABLE" && (
            <FormField label={x.fMilestone}>
              <select value={form.parentItemId} onChange={(e) => set("parentItemId", e.target.value)} className="field">
                <option value="">{x.noMilestone}</option>
                {milestones.map((m) => <option key={m.itemId} value={m.itemId}>{m.title}</option>)}
              </select>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label={x.fStatus}>
              <select value={form.statusCode} onChange={(e) => set("statusCode", e.target.value)} className="field">
                {ROADMAP_ITEM_STATUSES.map((s) => <option key={s} value={s}>{statuses[s]}</option>)}
              </select>
            </FormField>
            <FormField label={x.fOwner}>
              <input value={form.owner} onChange={(e) => set("owner", e.target.value)} className="field" />
            </FormField>
            <FormField label={x.fDue}>
              <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="field" />
            </FormField>
            {form.statusCode === "COMPLETED" && (
              <FormField label={x.fCompleted} hint={x.completedHint}>
                <input type="date" value={form.completedDate} onChange={(e) => set("completedDate", e.target.value)} className="field" />
              </FormField>
            )}
          </div>
          <FormField label={x.fDescription}>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className="field" />
          </FormField>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="accent-brand-purple w-4 h-4 mt-0.5" checked={form.announce} onChange={(e) => set("announce", e.target.checked)} />
            <span>
              <span className="block text-sm text-ink">{x.announceLabel}</span>
              <span className="block text-[11px] text-muted">{x.announceHint}</span>
            </span>
          </label>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        </FormDialog>
      )}
    </div>
  );
}
