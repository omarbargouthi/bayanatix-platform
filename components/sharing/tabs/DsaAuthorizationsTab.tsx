"use client";

import { useState } from "react";
import type { DsaDetail, DsaAuthorization } from "@/lib/queries/sharing";
import { useLang } from "@/lib/lang-context";

type Props = {
  dsaId:           number;
  dsa:             DsaDetail | null;
  authorizations:  DsaAuthorization[];
  isEditable:      boolean;
  onChanged:       () => void;
};

const BLANK = { controllerNameText: "", scopeText: "", evidenceDocumentRef: "", issuedDate: "", validUntilDate: "" };

export function DsaAuthorizationsTab({ dsaId, dsa, authorizations, isEditable, onChanged }: Props) {
  const { t } = useLang();
  const au = t.sharing.auth;
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ ...BLANK });
  const [saving, setSaving]   = useState(false);

  const needsAuth = dsa?.entityRoleCode === "PROCESSOR" || dsa?.entityRoleCode === "MIXED";

  async function add() {
    if (!form.controllerNameText || !form.evidenceDocumentRef) return;
    setSaving(true);
    await fetch(`/api/sharing/dsas/${dsaId}/authorizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowAdd(false);
    setForm({ ...BLANK });
    onChanged();
  }

  async function remove(id: number) {
    if (!confirm(au.removeConfirm)) return;
    await fetch(`/api/sharing/dsas/${dsaId}/authorizations?authId=${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* ── PDPL Role notice ── */}
      <div className={`p-4 rounded-xl border text-sm ${needsAuth ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
        <div className="font-semibold mb-1">
          {needsAuth ? au.processorNoticeTitle : au.controllerNoticeTitle}
        </div>
        <div className="text-muted text-[12px]">
          {needsAuth ? au.processorNoticeText : au.controllerNoticeText}
        </div>
      </div>

      {/* ── Authorization list ── */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink text-sm">{au.sectionTitle}</h2>
        {isEditable && (
          <button onClick={() => setShowAdd(v => !v)} className="btn btn-primary btn-sm">{au.addBtn}</button>
        )}
      </div>

      {showAdd && (
        <div className="card p-5 border-brand-purple space-y-4">
          <h3 className="text-sm font-semibold text-ink">{au.newTitle}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{au.fieldControllerName}</label>
              <input className="input w-full" placeholder={au.fieldControllerNamePh} value={form.controllerNameText} onChange={e => setForm(f => ({ ...f, controllerNameText: e.target.value }))} />
            </div>
            <div>
              <label className="label">{au.fieldEvidenceRef}</label>
              <input className="input w-full" placeholder={au.fieldEvidenceRefPh} value={form.evidenceDocumentRef} onChange={e => setForm(f => ({ ...f, evidenceDocumentRef: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">{au.fieldScope}</label>
              <input className="input w-full" placeholder={au.fieldScopePh} value={form.scopeText} onChange={e => setForm(f => ({ ...f, scopeText: e.target.value }))} />
            </div>
            <div>
              <label className="label">{au.fieldIssued}</label>
              <input type="date" className="input w-full" value={form.issuedDate} onChange={e => setForm(f => ({ ...f, issuedDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">{au.fieldValidUntil}</label>
              <input type="date" className="input w-full" value={form.validUntilDate} onChange={e => setForm(f => ({ ...f, validUntilDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setShowAdd(false)}>{t.common.cancel}</button>
            <button className="btn btn-primary" disabled={saving} onClick={add}>{saving ? t.common.saving : t.common.add}</button>
          </div>
        </div>
      )}

      {authorizations.length === 0 ? (
        <div className="card p-8 text-center text-muted text-sm italic">
          {needsAuth ? au.noneYet : au.noneRequired}
        </div>
      ) : (
        <div className="space-y-3">
          {authorizations.map(a => (
            <div key={a.authorizationId} className="card p-5 flex items-start gap-4">
              <div className="flex-1 space-y-1">
                <div className="font-medium text-ink text-sm">{a.controllerNameText}</div>
                {a.scopeText && <div className="text-[12px] text-muted">{a.scopeText}</div>}
                <div className="flex items-center gap-4 text-[11px] text-muted flex-wrap">
                  <span>{au.refLabel.replace("{ref}", "")}<span className="font-mono text-brand-purple">{a.evidenceDocumentRef}</span></span>
                  {a.issuedDate     && <span>{au.issuedLabel.replace("{date}", a.issuedDate)}</span>}
                  {a.validUntilDate && <span>{au.validUntilLabel.replace("{date}", a.validUntilDate)}</span>}
                </div>
                <div className="mt-1">
                  {a.verifiedAt
                    ? <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{au.verifiedByLabel.replace("{name}", a.verifiedByName ?? a.verifiedByUserId ?? "")}</span>
                    : <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{au.pendingVerification}</span>}
                </div>
              </div>
              {isEditable && (
                <button onClick={() => remove(a.authorizationId)} className="text-[11px] text-red-400 hover:text-red-600">{t.sharing.datasets.removeBtn}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
