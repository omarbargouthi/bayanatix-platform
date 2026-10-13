"use client";

// Risks scored before and after mitigation, and the measures that bring them down.
// A measure's progress can be recorded after approval; its wording cannot change then.
import { useState } from "react";
import { useLang } from "@/lib/lang-context";
import {
  MEASURE_STATUSES, SUGGESTED_RISKS, inherentLevel, residualLevel, riskLevel, overallInherent, overallResidual,
  type DpiaDetail, type DpiaFlagCode, type DpiaMeasure, type DpiaPermissions, type DpiaRisk,
} from "@/lib/privacy/dpia-types";
import { Dialog, ErrorNote, LevelBadge, day, errorText, fill, flagText } from "./dpia-ui";

type Users = { userId: string; name: string }[];
type Call = (url: string, method: string, body?: object) => Promise<{ ok: boolean; res: { code?: string; error?: string } }>;

export function DpiaRisksTab({ dpia, permissions, users, call }: { dpia: DpiaDetail; permissions: DpiaPermissions | null; users: Users; call: Call }) {
  const { t } = useLang();
  const d = t.dpia;
  const editable = !!permissions?.canEdit && dpia.statusCode === "ASSESSMENT";
  const base = `/api/privacy/dpia/${dpia.dpiaId}`;
  const [riskDialog, setRiskDialog] = useState<DpiaRisk | "new" | null>(null);
  const [measureDialog, setMeasureDialog] = useState<{ measure: DpiaMeasure | null; riskId: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (url: string, method: string, body?: object) => { setError(null); const r = await call(url, method, body); if (!r.ok) setError(errorText(t, r.res)); return r.ok; };

  const suggestions = (dpia.facts?.flags ?? []).filter((f) => SUGGESTED_RISKS[f.code] && !dpia.risks.some((r) => r.sourceFlag === f.code));
  const suggested = (codes: DpiaFlagCode[]) => codes.map((code) => ({
    title: (d.suggested as Record<string, string>)[code], sourceFlag: code,
    description: flagText(t, dpia.facts!.flags.find((f) => f.code === code)!),
    inherentLikelihood: SUGGESTED_RISKS[code]!.likelihood, inherentSeverity: SUGGESTED_RISKS[code]!.severity,
  }));
  const loose = dpia.measures.filter((m) => m.riskId == null || !dpia.risks.some((r) => r.riskId === m.riskId));
  const canProgress = (m: DpiaMeasure) => !!permissions && (permissions.isAuthor || m.ownerUserId === permissions.userId);

  const measureRow = (m: DpiaMeasure) => (
    <div key={m.measureId} className="flex items-start gap-3 py-2 border-t border-line-soft first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink" dir="auto">{m.text}</div>
        <div className="text-[11px] text-muted mt-0.5">
          {m.ownerName ?? d.noOwner} · {d.due} {day(m.dueDate)}
          {m.overdue && <span className="ms-1.5 font-semibold text-red-700">{d.overdue}</span>}
          {m.completedDate && <span className="ms-1.5">· {d.completed} {m.completedDate}</span>}
        </div>
        {m.note && <div className="text-[12px] text-ink-soft mt-0.5" dir="auto">{m.note}</div>}
      </div>
      {canProgress(m) ? (
        <select className="input-sm w-36 shrink-0" value={m.status} aria-label={d.measureStatus}
          onChange={(e) => run(`${base}/measures/${m.measureId}`, "PATCH", { status: e.target.value })}>
          {MEASURE_STATUSES.map((s) => <option key={s} value={s}>{d.measureStatuses[s]}</option>)}
        </select>
      ) : <span className="text-[12px] text-ink-soft shrink-0">{d.measureStatuses[m.status]}</span>}
      {editable && (
        <div className="flex gap-2 shrink-0 text-[12px] pt-1">
          <button onClick={() => setMeasureDialog({ measure: m, riskId: m.riskId })} className="text-brand-purple hover:underline">{t.common.edit}</button>
          <button onClick={() => { if (window.confirm(d.deleteMeasureConfirm)) run(`${base}/measures/${m.measureId}`, "DELETE"); }} className="text-red-600 hover:underline">{t.common.delete}</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-brand-deep">{d.risksTitle}</h3>
          <p className="text-[12px] text-muted mt-0.5 max-w-3xl">{d.risksDesc}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[12px] text-muted">{d.inherent} <LevelBadge level={overallInherent(dpia.risks)} /></div>
          <div className="text-[12px] text-muted">{d.residual} <LevelBadge level={overallResidual(dpia.risks)} /></div>
          {editable && <button onClick={() => setRiskDialog("new")} className="btn btn-primary btn-sm">{d.addRisk}</button>}
        </div>
      </div>
      <ErrorNote text={error} />

      {editable && suggestions.length > 0 && (
        <div className="card p-4 border-brand-purple/25 bg-brand-purple/5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-bold text-brand-deep">{d.suggestedTitle}</div>
            <button onClick={() => run(`${base}/risks`, "POST", { items: suggested(suggestions.map((s) => s.code)) })} className="btn btn-sm">{d.addAll}</button>
          </div>
          <p className="text-[12px] text-muted mt-0.5">{d.suggestedDesc}</p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.code} className="flex items-start justify-between gap-3 text-[13px]">
                <div><span className="text-ink font-medium">{(d.suggested as Record<string, string>)[s.code]}</span><div className="text-[11px] text-muted" dir="auto">{flagText(t, s)}</div></div>
                <button onClick={() => run(`${base}/risks`, "POST", { items: suggested([s.code]) })} className="text-[12px] text-brand-purple hover:underline shrink-0">{d.add}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dpia.risks.length === 0 && <div className="card p-10 text-center text-sm text-muted">{d.noRisks}</div>}
      {dpia.risks.map((r) => {
        const measures = dpia.measures.filter((m) => m.riskId === r.riskId);
        return (
          <div key={r.riskId} className="card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink" dir="auto">{r.title}</div>
                {r.description && <div className="text-[12px] text-ink-soft mt-0.5" dir="auto">{r.description}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted">
                <span title={`${d.likelihood} ${d.scale[r.inherentLikelihood as 1 | 2 | 3]} × ${d.severity} ${d.scale[r.inherentSeverity as 1 | 2 | 3]}`}>{d.inherent} <LevelBadge level={inherentLevel(r)} /></span>
                <span>{d.residual} {r.residualLikelihood ? <LevelBadge level={residualLevel(r)} /> : <span className="text-muted">{d.notScored}</span>}</span>
                {editable && <>
                  <button onClick={() => setRiskDialog(r)} className="text-[12px] text-brand-purple hover:underline">{t.common.edit}</button>
                  <button onClick={() => { if (window.confirm(d.deleteRiskConfirm)) run(`${base}/risks/${r.riskId}`, "DELETE"); }} className="text-[12px] text-red-600 hover:underline">{t.common.delete}</button>
                </>}
              </div>
            </div>
            <div className="mt-3 border-t border-line pt-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{d.measures}</div>
                {editable && <button onClick={() => setMeasureDialog({ measure: null, riskId: r.riskId })} className="text-[12px] text-brand-purple hover:underline">{d.addMeasure}</button>}
              </div>
              {measures.length === 0 ? <p className="text-[12px] text-muted py-1.5">{d.noMeasures}</p> : measures.map(measureRow)}
            </div>
          </div>
        );
      })}

      {(loose.length > 0 || editable) && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-brand-deep">{d.generalMeasures}</div>
            {editable && <button onClick={() => setMeasureDialog({ measure: null, riskId: null })} className="text-[12px] text-brand-purple hover:underline">{d.addMeasure}</button>}
          </div>
          {loose.length === 0 ? <p className="text-[12px] text-muted py-1.5">{d.noGeneralMeasures}</p> : loose.map(measureRow)}
        </div>
      )}

      {riskDialog && <RiskDialog risk={riskDialog === "new" ? null : riskDialog} onClose={() => setRiskDialog(null)}
        onSave={(body, risk) => call(risk ? `${base}/risks/${risk.riskId}` : `${base}/risks`, risk ? "PATCH" : "POST", risk ? body : { items: [body] })} />}
      {measureDialog && <MeasureDialog {...measureDialog} risks={dpia.risks} users={users} onClose={() => setMeasureDialog(null)}
        onSave={(body, m) => call(m ? `${base}/measures/${m.measureId}` : `${base}/measures`, m ? "PATCH" : "POST", body)} />}
    </div>
  );
}

function RiskDialog({ risk, onClose, onSave }: { risk: DpiaRisk | null; onClose: () => void; onSave: (body: object, risk: DpiaRisk | null) => ReturnType<Call> }) {
  const { t } = useLang();
  const d = t.dpia;
  const [f, setF] = useState({
    title: risk?.title ?? "", description: risk?.description ?? "", inherentLikelihood: risk?.inherentLikelihood ?? 2, inherentSeverity: risk?.inherentSeverity ?? 2,
    residualLikelihood: risk?.residualLikelihood ?? 0, residualSeverity: risk?.residualSeverity ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = (key: "inherentLikelihood" | "inherentSeverity" | "residualLikelihood" | "residualSeverity", label: string, optional: boolean) => (
    <div>
      <label className="field-label">{label}</label>
      <select className="input-field w-full" value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })}>
        {optional && <option value={0}>{d.notScored}</option>}
        {[1, 2, 3].map((n) => <option key={n} value={n}>{d.scale[n as 1 | 2 | 3]}</option>)}
      </select>
    </div>
  );
  async function save() {
    setBusy(true); setError(null);
    const r = await onSave({ ...f, residualLikelihood: f.residualLikelihood || null, residualSeverity: f.residualSeverity || null }, risk);
    setBusy(false);
    if (!r.ok) setError(errorText(t, r.res)); else onClose();
  }
  return (
    <Dialog title={risk ? d.editRisk : d.addRisk} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={save} disabled={busy || !f.title.trim()} className="btn btn-primary btn-sm">{t.common.save}</button>
    </>}>
      <div>
        <label className="field-label">{d.riskTitle}</label>
        <input className="input-field w-full" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={d.riskTitlePh} dir="auto" maxLength={300} />
      </div>
      <div>
        <label className="field-label">{d.riskDescription}</label>
        <textarea className="input-field w-full" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} dir="auto" />
      </div>
      <div className="text-[12px] font-bold text-brand-deep pt-1">{d.inherentLong}</div>
      <div className="grid grid-cols-3 gap-3 items-end">
        {pick("inherentLikelihood", d.likelihood, false)}{pick("inherentSeverity", d.severity, false)}
        <div className="pb-2"><LevelBadge level={riskLevel(f.inherentLikelihood, f.inherentSeverity)} /></div>
      </div>
      <div className="text-[12px] font-bold text-brand-deep pt-1">{d.residualLong}</div>
      <div className="grid grid-cols-3 gap-3 items-end">
        {pick("residualLikelihood", d.likelihood, true)}{pick("residualSeverity", d.severity, true)}
        <div className="pb-2"><LevelBadge level={riskLevel(f.residualLikelihood || null, f.residualSeverity || null)} /></div>
      </div>
      <p className="text-[11px] text-muted">{d.scoreHint}</p>
      <ErrorNote text={error} />
    </Dialog>
  );
}

function MeasureDialog({ measure, riskId, risks, users, onClose, onSave }: {
  measure: DpiaMeasure | null; riskId: number | null; risks: DpiaRisk[]; users: Users; onClose: () => void;
  onSave: (body: object, measure: DpiaMeasure | null) => ReturnType<Call>;
}) {
  const { t } = useLang();
  const d = t.dpia;
  const [f, setF] = useState({ text: measure?.text ?? "", riskId: riskId ?? 0, ownerUserId: measure?.ownerUserId ?? "", dueDate: measure?.dueDate ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    const r = await onSave({ ...f, riskId: f.riskId || null, ownerUserId: f.ownerUserId || null, dueDate: f.dueDate || null }, measure);
    setBusy(false);
    if (!r.ok) setError(errorText(t, r.res)); else onClose();
  }
  return (
    <Dialog title={measure ? d.editMeasure : d.addMeasure} onClose={onClose} footer={<>
      <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
      <button onClick={save} disabled={busy || !f.text.trim()} className="btn btn-primary btn-sm">{t.common.save}</button>
    </>}>
      <div>
        <label className="field-label">{d.measureText}</label>
        <textarea className="input-field w-full" rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder={d.measureTextPh} dir="auto" />
      </div>
      <div>
        <label className="field-label">{d.measureRisk}</label>
        <select className="input-field w-full" value={f.riskId} onChange={(e) => setF({ ...f, riskId: Number(e.target.value) })}>
          <option value={0}>{d.measureNoRisk}</option>
          {risks.map((r) => <option key={r.riskId} value={r.riskId}>{r.title}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{d.measureOwner}</label>
          <select className="input-field w-full" value={f.ownerUserId} onChange={(e) => setF({ ...f, ownerUserId: e.target.value })}>
            <option value="">{d.noOwner}</option>
            {users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{d.measureDue}</label>
          <input type="date" className="input-field w-full" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </div>
      </div>
      <p className="text-[11px] text-muted">{fill(d.measureOwnerHint, {})}</p>
      <ErrorNote text={error} />
    </Dialog>
  );
}
