"use client";

// The register of impact assessments: every screening and assessment, its status, the
// risk before and after mitigation, open measures, the decision and the next review.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";
import { DPIA_STATUSES, type DpiaSummary, type DpiaTemplate } from "@/lib/privacy/dpia-types";
import { AssetPicker, Dialog, ErrorNote, LevelBadge, StatusBadge, assetTypeLabel, day, errorText, fill, type CustomTypeOption } from "./dpia-ui";

type Options = { templates: DpiaTemplate[]; users: { userId: string; name: string; role: string }[]; customTypes: CustomTypeOption[]; canCreate: boolean };

export function DpiaRegisterTab() {
  const { t, lang } = useLang();
  const d = t.dpia;
  const [items, setItems] = useState<DpiaSummary[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const load = useCallback(() => {
    fetch("/api/privacy/dpia").then((r) => (r.ok ? r.json() : { items: [] }))
      .then((res) => { setItems(res.items ?? []); setCanCreate(!!res.canCreate); }).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (items ?? []).filter((r) => {
    if (status === "REVIEW_DUE" ? !r.reviewDue : status && r.statusCode !== status) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.referenceCode, r.title, r.subject?.name ?? "", r.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
  }), [items, status, search]);
  const count = (fn: (r: DpiaSummary) => boolean) => (items ?? []).filter(fn).length;

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-brand-deep">{d.title}</h2>
          <p className="text-[13px] text-muted mt-1 max-w-4xl">{d.desc}</p>
        </div>
        {canCreate && <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm shrink-0">{d.newDpia}</button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          [d.kpiInProgress, count((r) => r.statusCode === "SCREENING" || r.statusCode === "ASSESSMENT")],
          [d.kpiInReview, count((r) => r.statusCode === "IN_REVIEW")],
          [d.kpiOpenMeasures, (items ?? []).reduce((n, r) => n + r.measuresOpen, 0)],
          [d.kpiReviewDue, count((r) => r.reviewDue)],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{label}</div>
            <div className="text-2xl font-bold text-brand-deep mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="input-field w-72" placeholder={d.searchPh} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
        <select className="input-field w-56" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={d.colStatus}>
          <option value="">{d.allStatuses}</option>
          {DPIA_STATUSES.map((s) => <option key={s} value={s}>{d.statuses[s]}</option>)}
          <option value="REVIEW_DUE">{d.reviewDue}</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-canvas-soft">
            <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
              <th className="px-4 py-2.5 text-start">{d.colReference}</th>
              <th className="px-4 py-2.5 text-start">{d.colSubject}</th>
              <th className="px-4 py-2.5 text-start">{d.colOwner}</th>
              <th className="px-4 py-2.5 text-start">{d.colStatus}</th>
              <th className="px-4 py-2.5 text-start">{d.colRisk}</th>
              <th className="px-4 py-2.5 text-start">{d.colMeasures}</th>
              <th className="px-4 py-2.5 text-start">{d.colDecided}</th>
              <th className="px-4 py-2.5 text-start">{d.colNextReview}</th>
            </tr>
          </thead>
          <tbody>
            {items && shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-muted">{items.length === 0 ? d.empty : d.noMatch}</td></tr>}
            {shown.map((r) => (
              <tr key={r.dpiaId} className="border-t border-line-soft hover:bg-canvas-soft/60">
                <td className="px-4 py-2.5">
                  <Link href={`/privacy/dpia/${r.dpiaId}`} className="text-[13px] font-semibold text-brand-purple hover:underline">{r.referenceCode}</Link>
                  <div className="text-[12px] text-ink" dir="auto">{r.title}</div>
                  <div className="text-[11px] text-muted">{pickTranslation(r.templateName, r.templateNameTranslations, lang)}</div>
                </td>
                <td className="px-4 py-2.5 text-[13px]">
                  {r.subject ? <><div className="text-ink" dir="auto">{r.subject.name}</div><div className="text-[11px] text-muted">{assetTypeLabel(t, r.subject.typeCode, r.subject.typeName)}</div></> : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[13px] text-ink-soft" dir="auto">{r.ownerName ?? "—"}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.statusCode} /></td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {r.inherentLevel ? <span className="inline-flex items-center gap-1"><LevelBadge level={r.inherentLevel} /><span className="text-muted text-[11px]">→</span><LevelBadge level={r.residualLevel} /></span> : <span className="text-muted text-[12px]">—</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">
                  {r.measuresTotal === 0 ? "—" : `${r.measuresTotal - r.measuresOpen} / ${r.measuresTotal}`}
                  {r.measuresOverdue > 0 && <span className="ms-1.5 text-[11px] font-semibold text-red-700">{fill(d.overdueN, { n: r.measuresOverdue })}</span>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{day(r.decidedAt)}{r.versionNo > 0 && <div className="text-[11px] text-muted">{fill(d.versionN, { n: r.versionNo })}</div>}</td>
                <td className="px-4 py-2.5 text-[12px] whitespace-nowrap">
                  <span className="text-ink-soft">{day(r.nextReviewDate)}</span>
                  {r.reviewDue && <div className="text-[11px] font-semibold text-red-700">{d.reviewDue}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewDpiaDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewDpiaDialog({ onClose, subject }: { onClose: () => void; subject?: { typeCode: string; id: number; name: string } }) {
  const { t, lang } = useLang();
  const d = t.dpia;
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ title: subject?.name ?? "", description: "", templateId: 0, ownerUserId: "" });
  const [picked, setPicked] = useState<{ typeCode: string; id: number; name: string } | null>(subject ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/privacy/dpia?options=1").then((r) => (r.ok ? r.json() : null)).then((o: Options | null) => {
      if (!o) return;
      setOptions(o);
      setForm((f) => ({ ...f, templateId: (o.templates.find((x) => x.isDefault) ?? o.templates[0])?.templateId ?? 0 }));
    });
  }, []);
  const tpl = options?.templates.find((x) => x.templateId === form.templateId);

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/dpia", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, subjectType: picked?.typeCode, subjectId: picked?.id }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(errorText(t, res)); return; }
      router.push(`/privacy/dpia/${res.dpiaId}`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog title={d.newTitle} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={create} disabled={busy || !form.title.trim() || !form.templateId} className="btn btn-primary btn-sm">{busy ? d.creating : d.create}</button>
    </>}>
      <div>
        <label className="field-label">{d.fSubject}</label>
        {picked ? (
          <div className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2">
            <span className="text-[13px] text-ink" dir="auto">{picked.name}</span>
            {!subject && <button onClick={() => setPicked(null)} className="text-[12px] text-brand-purple hover:underline">{d.change}</button>}
          </div>
        ) : options ? (
          <AssetPicker customTypes={options.customTypes} defaultType={options.customTypes.some((c) => c.typeCode === "ACTIVITY") ? "CUSTOM:ACTIVITY" : undefined}
            onPick={(h) => { setPicked(h); setForm((f) => ({ ...f, title: f.title || h.name })); }} />
        ) : null}
        <p className="text-[11px] text-muted mt-1">{d.subjectHint}</p>
      </div>
      <div>
        <label className="field-label">{d.fTitle}</label>
        <input className="input-field w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" maxLength={255} />
      </div>
      <div>
        <label className="field-label">{d.fDescription}</label>
        <textarea className="input-field w-full" rows={2} placeholder={d.descriptionPh} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} dir="auto" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{d.fTemplate}</label>
          <select className="input-field w-full" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: Number(e.target.value) })}>
            {options?.templates.map((x) => <option key={x.templateId} value={x.templateId}>{pickTranslation(x.name, x.nameTranslations, lang)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{d.fOwner}</label>
          <select className="input-field w-full" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
            <option value="">{d.ownerMe}</option>
            {options?.users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
          </select>
        </div>
      </div>
      {tpl && <p className="text-[11px] text-muted" dir="auto">{pickTranslation(tpl.regulation, tpl.regulationTranslations, lang)} — {pickTranslation(tpl.description, tpl.descriptionTranslations, lang)}</p>}
      <ErrorNote text={error} />
    </Dialog>
  );
}
