"use client";

import { useState, useEffect } from "react";
import type { DsaDetail } from "@/lib/queries/sharing";
import { useLang } from "@/lib/lang-context";

type Props = {
  dsaId:      number | null;
  dsa:        DsaDetail | null;
  isEditable: boolean;
  onSaved:    () => void;
};

export function DsaTermsTab({ dsaId, dsa, isEditable, onSaved }: Props) {
  const { t } = useLang();
  const s = t.sharing;
  const tm = s.terms;
  const [form, setForm] = useState({
    securityControlsText:      dsa?.securityControlsText      ?? "",
    storageConditionsText:     dsa?.storageConditionsText     ?? "",
    destructionMechanismText:  dsa?.destructionMechanismText  ?? "",
    liabilityTermsText:        dsa?.liabilityTermsText        ?? "",
    reviewTermsText:           dsa?.reviewTermsText           ?? "",
    riskAssessmentRef:         dsa?.riskAssessmentRef         ?? "",
    signedDocumentRef:         dsa?.signedDocumentRef         ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    if (dsa) setForm({
      securityControlsText:      dsa.securityControlsText      ?? "",
      storageConditionsText:     dsa.storageConditionsText     ?? "",
      destructionMechanismText:  dsa.destructionMechanismText  ?? "",
      liabilityTermsText:        dsa.liabilityTermsText        ?? "",
      reviewTermsText:           dsa.reviewTermsText           ?? "",
      riskAssessmentRef:         dsa.riskAssessmentRef         ?? "",
      signedDocumentRef:         dsa.signedDocumentRef         ?? "",
    });
  }, [dsa]);

  async function save() {
    if (!dsaId) return;
    setSaving(true);
    await fetch(`/api/sharing/dsas/${dsaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  const f = <K extends keyof typeof form>(key: K) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const isExternal = dsa?.sharingScopeCode !== "INTERNAL";

  const textArea = (key: keyof typeof form, label: string, ph: string, required = false) => (
    <div>
      <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <textarea
        className="input w-full h-24 resize-y"
        disabled={!isEditable}
        placeholder={ph}
        value={form[key]}
        onChange={f(key)}
      />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">{tm.sectionSecurity}</h2>
        {textArea("securityControlsText", tm.fieldSecurityControls, tm.fieldSecurityControlsPh, true)}
        {textArea("storageConditionsText", tm.fieldStorageConditions, tm.fieldStorageConditionsPh, true)}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">{tm.sectionObligations}</h2>
        {textArea("destructionMechanismText", tm.fieldDestruction, tm.fieldDestructionPh, true)}
        {textArea("liabilityTermsText", tm.fieldLiability, tm.fieldLiabilityPh, true)}
        {textArea("reviewTermsText", tm.fieldReview, tm.fieldReviewPh)}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">{tm.sectionReferences}</h2>

        <div>
          <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
            {tm.fieldRiskRef}{isExternal && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            className="input w-full"
            disabled={!isEditable}
            placeholder={tm.fieldRiskRefPh}
            value={form.riskAssessmentRef}
            onChange={f("riskAssessmentRef")}
          />
          {isExternal && (
            <p className="text-[10px] text-muted mt-1">{tm.riskRefHint}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-muted uppercase mb-1">{tm.fieldSignedDoc}</label>
          <input
            className="input w-full"
            disabled={!isEditable}
            placeholder={tm.fieldSignedDocPh}
            value={form.signedDocumentRef}
            onChange={f("signedDocumentRef")}
          />
          <p className="text-[10px] text-muted mt-1">{tm.signedDocHint}</p>
        </div>
      </div>

      {isEditable && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? t.common.saving : saved ? s.savedCheck : t.common.save}
          </button>
        </div>
      )}
    </div>
  );
}
