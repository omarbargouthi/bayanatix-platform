"use client";

import { useState, useEffect } from "react";
import type { DsaDetail } from "@/lib/queries/sharing";

type Props = {
  dsaId:      number | null;
  dsa:        DsaDetail | null;
  isEditable: boolean;
  onSaved:    () => void;
};

export function DsaTermsTab({ dsaId, dsa, isEditable, onSaved }: Props) {
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

  const textArea = (key: keyof typeof form, ph: string, required = false) => (
    <div>
      <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
        {key.replace(/([A-Z])/g, " $1").replace("Text","").trim()}
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
        <h2 className="font-semibold text-ink text-sm">Security & Storage</h2>
        {textArea("securityControlsText", "Encryption in transit/at rest, access controls, MFA requirements…", true)}
        {textArea("storageConditionsText", "Where the recipient stores the data, retention limits at their end…", true)}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">Obligations</h2>
        {textArea("destructionMechanismText", "How and when the recipient must destroy or return data at agreement end…", true)}
        {textArea("liabilityTermsText", "Non-compliance liability allocation between provider and recipient…", true)}
        {textArea("reviewTermsText", "Conditions for data review, modification, or re-consent during the term…")}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">References & Evidence</h2>

        <div>
          <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
            Risk Assessment Reference{isExternal && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <input
            className="input w-full"
            disabled={!isEditable}
            placeholder="Document reference / SharePoint path to the sharing risk assessment (NDI DSI.MQ.4)"
            value={form.riskAssessmentRef}
            onChange={f("riskAssessmentRef")}
          />
          {isExternal && (
            <p className="text-[10px] text-muted mt-1">Required for all external agreements (NDI DSI.MQ.4).</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Signed Document Reference</label>
          <input
            className="input w-full"
            disabled={!isEditable}
            placeholder="Pointer to the executed/signed agreement document"
            value={form.signedDocumentRef}
            onChange={f("signedDocumentRef")}
          />
          <p className="text-[10px] text-muted mt-1">Required before the agreement can move to ACTIVE status.</p>
        </div>
      </div>

      {isEditable && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
