"use client";

// The register of personal data breaches: every report, its status, the risk, where the
// 72-hour regulator notification stands and whether the people concerned were told.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { BREACH_REGULATIONS, BREACH_STATUSES, isBreachOpen, type BreachRegulation, type BreachSummary } from "@/lib/privacy/breach-types";
import { AssetPicker, Dialog, ErrorNote, fill, type CustomTypeOption } from "./dpia-ui";
import { AuthorityCell, BreachRiskBadge, BreachStatusBadge, SubjectsCell, breachError, fromLocalInput, toLocalInput, when } from "./breach-ui";

type Options = { users: { userId: string; name: string; role: string }[]; customTypes: CustomTypeOption[]; canAssign: boolean; regulations: BreachRegulation[] };

export function BreachRegister() {
  const { t, lang } = useLang();
  const b = t.breach;
  const [items, setItems] = useState<BreachSummary[] | null>(null);
  const [status, setStatus] = useState("OPEN");
  const [search, setSearch] = useState("");
  const [reporting, setReporting] = useState(false);
  const load = useCallback(() => {
    fetch("/api/privacy/breaches").then((r) => (r.ok ? r.json() : { items: [] })).then((res) => setItems(res.items ?? [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (items ?? []).filter((r) => {
    if (status === "OPEN" ? !isBreachOpen(r.statusCode) : status && r.statusCode !== status) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.referenceCode, r.title, r.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
  }), [items, status, search]);
  const count = (fn: (r: BreachSummary) => boolean) => (items ?? []).filter(fn).length;
  const year = String(new Date().getFullYear());

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-brand-deep">{b.title}</h2>
          <p className="text-[13px] text-muted mt-1 max-w-4xl">{b.desc}</p>
        </div>
        <button onClick={() => setReporting(true)} className="btn btn-primary btn-sm shrink-0">{b.report}</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          [b.kpiOpen, count((r) => isBreachOpen(r.statusCode)), ""],
          [b.kpiDueSoon, count((r) => r.notices.some((n) => n.state === "DUE_SOON")), "text-amber-700"],
          [b.kpiOverdue, count((r) => r.notices.some((n) => n.state === "OVERDUE")), "text-red-700"],
          [b.kpiClosedYear, count((r) => r.statusCode === "CLOSED" && (r.closedAt ?? "").startsWith(year)), ""],
        ] as [string, number, string][]).map(([label, value, tone]) => (
          <div key={label} className="card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${value > 0 && tone ? tone : "text-brand-deep"}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="input-field w-72" placeholder={b.searchPh} value={search} onChange={(e) => setSearch(e.target.value)} dir="auto" />
        <select className="input-field w-56" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={b.colStatus}>
          <option value="OPEN">{b.openOnly}</option>
          <option value="">{b.allStatuses}</option>
          {BREACH_STATUSES.map((s) => <option key={s} value={s}>{b.statuses[s]}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-canvas-soft">
            <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
              <th className="px-4 py-2.5 text-start">{b.colBreach}</th>
              <th className="px-4 py-2.5 text-start">{b.colDiscovered}</th>
              <th className="px-4 py-2.5 text-start">{b.colStatus}</th>
              <th className="px-4 py-2.5 text-start">{b.colRisk}</th>
              <th className="px-4 py-2.5 text-start">{b.colAuthority}</th>
              <th className="px-4 py-2.5 text-start">{b.colSubjects}</th>
              <th className="px-4 py-2.5 text-start">{b.colData}</th>
              <th className="px-4 py-2.5 text-start">{b.colHandler}</th>
            </tr>
          </thead>
          <tbody>
            {items && shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-muted">{items.length === 0 ? b.empty : b.noMatch}</td></tr>}
            {shown.map((r) => (
              <tr key={r.breachId} className="border-t border-line-soft hover:bg-canvas-soft/60 align-top">
                <td className="px-4 py-2.5">
                  <Link href={`/privacy/breaches/${r.breachId}`} className="text-[13px] font-semibold text-brand-purple hover:underline">{r.referenceCode}</Link>
                  <div className="text-[12px] text-ink max-w-xs" dir="auto">{r.title}</div>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft whitespace-nowrap">{when(r.discoveredAt, lang)}</td>
                <td className="px-4 py-2.5"><BreachStatusBadge status={r.statusCode} /></td>
                <td className="px-4 py-2.5"><BreachRiskBadge level={r.riskLevel} /></td>
                <td className="px-4 py-2.5"><AuthorityCell notices={r.notices} /></td>
                <td className="px-4 py-2.5"><SubjectsCell state={r.subjectsState} /></td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft">
                  {r.piColumns > 0 ? fill(b.piColumnsN, { n: r.piColumns }) : "—"}
                  {r.subjectsEstimate != null && <div className="text-[11px] text-muted">{b.fSubjects}: {r.subjectsEstimate.toLocaleString("en-US")}</div>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-ink-soft" dir="auto">{r.ownerName ?? <span className="text-muted">{b.ownerUnassigned}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reporting && <ReportDialog onClose={() => setReporting(false)} />}
    </div>
  );
}

function ReportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const b = t.breach;
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({ title: "", description: "", discoveredAt: toLocalInput(new Date().toISOString()), ownerUserId: "" });
  const [assets, setAssets] = useState<{ typeCode: string; id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [laws, setLaws] = useState<BreachRegulation[]>([]);
  useEffect(() => {
    fetch("/api/privacy/breaches?options=1").then((r) => (r.ok ? r.json() : null)).then((o: Options | null) => { setOptions(o); if (o) setLaws(o.regulations); });
  }, []);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/privacy/breaches", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, discoveredAt: fromLocalInput(form.discoveredAt), regulations: laws, assets: assets.map((a) => ({ typeCode: a.typeCode, id: a.id })) }) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(breachError(t, res)); return; }
      router.push(`/privacy/breaches/${res.breachId}`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog title={b.reportTitle} onClose={onClose} wide footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={submit} disabled={busy || !form.title.trim() || (!!options?.canAssign && laws.length === 0)} className="btn btn-primary btn-sm">{busy ? b.reporting : b.submit}</button>
    </>}>
      <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{b.reportHint}</p>
      <div>
        <label className="field-label">{b.fTitle}</label>
        <input className="input-field w-full" value={form.title} placeholder={b.titlePh} maxLength={255} dir="auto" onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div>
        <label className="field-label">{b.fDescription}</label>
        <textarea className="input-field w-full" rows={3} value={form.description} placeholder={b.descriptionPh} dir="auto" onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{b.fDiscoveredAt}</label>
          <input type="datetime-local" className="input-field w-full" value={form.discoveredAt} max={toLocalInput(new Date().toISOString())} onChange={(e) => setForm({ ...form, discoveredAt: e.target.value })} />
          <p className="text-[11px] text-muted mt-1">{b.discoveredHint}</p>
        </div>
        {options?.canAssign && (
          <div>
            <label className="field-label">{b.fOwner}</label>
            <select className="input-field w-full" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
              <option value="">{b.ownerUnassigned}</option>
              {options.users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {options?.canAssign && (
        <div>
          <label className="field-label">{b.fRegulations}</label>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {BREACH_REGULATIONS.map((l) => (
              <label key={l} className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" className="accent-brand-purple" checked={laws.includes(l)} onChange={(e) => setLaws(e.target.checked ? [...laws, l] : laws.filter((x) => x !== l))} />
                {b.regulations[l]}
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="field-label">{b.fAssets}</label>
        {assets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {assets.map((a) => (
              <span key={`${a.typeCode}:${a.id}`} className="inline-flex items-center gap-1.5 text-[12px] bg-canvas-soft border border-line rounded-full ps-2.5 pe-1.5 py-0.5" dir="auto">
                {a.name}
                <button onClick={() => setAssets(assets.filter((x) => x !== a))} aria-label={b.remove} className="text-muted hover:text-red-600">&times;</button>
              </span>
            ))}
          </div>
        )}
        {options && <AssetPicker customTypes={options.customTypes} defaultType="DATA_ENTITIES"
          onPick={(h) => setAssets((prev) => prev.some((x) => x.typeCode === h.typeCode && x.id === h.id) ? prev : [...prev, { typeCode: h.typeCode, id: h.id, name: h.name }])} />}
        <p className="text-[11px] text-muted mt-1">{b.assetsHint}</p>
      </div>
      <ErrorNote text={error} />
    </Dialog>
  );
}
