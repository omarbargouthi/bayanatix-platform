"use client";

import { useState, useEffect } from "react";
import type { DsaDetail } from "@/lib/queries/sharing";

type Props = {
  dsaId:      number | null;
  dsa:        DsaDetail | null;
  isEditable: boolean;
  onSaved:    () => void;
};

const SCOPES     = ["INTERNAL","EXTERNAL_GOV","EXTERNAL_PRIVATE"];
const DIRECTIONS = ["PROVIDER","REQUESTER"];
const SCOPE_LABELS: Record<string,string>  = { INTERNAL:"Internal", EXTERNAL_GOV:"External – Government", EXTERNAL_PRIVATE:"External – Private" };
const DIR_LABELS:   Record<string,string>  = { PROVIDER:"Provider (we share out)", REQUESTER:"Requester (we receive)" };

export function DsaGeneralTab({ dsaId, dsa, isEditable, onSaved }: Props) {
  const [form, setForm] = useState({
    titleText:            dsa?.titleText            ?? "",
    sharingScopeCode:     dsa?.sharingScopeCode     ?? "INTERNAL",
    directionCode:        dsa?.directionCode        ?? "PROVIDER",
    counterpartyNameText: dsa?.counterpartyNameText ?? "",
    purposeText:          dsa?.purposeText          ?? "",
    legalBasisText:       dsa?.legalBasisText       ?? "",
    effectiveStartDate:   dsa?.effectiveStartDate   ?? "",
    effectiveEndDate:     dsa?.effectiveEndDate      ?? "",
    sharingFrequencyCode: dsa?.sharingFrequencyCode ?? "",
    sharingMethodCode:    dsa?.sharingMethodCode    ?? "",
    dataFormatCode:       dsa?.dataFormatCode       ?? "",
    entityRoleCode:       dsa?.entityRoleCode       ?? "",
    isCrossBorder:        dsa?.isCrossBorder        ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    if (dsa) setForm({
      titleText:            dsa.titleText            ?? "",
      sharingScopeCode:     dsa.sharingScopeCode     ?? "INTERNAL",
      directionCode:        dsa.directionCode        ?? "PROVIDER",
      counterpartyNameText: dsa.counterpartyNameText ?? "",
      purposeText:          dsa.purposeText          ?? "",
      legalBasisText:       dsa.legalBasisText       ?? "",
      effectiveStartDate:   dsa.effectiveStartDate   ?? "",
      effectiveEndDate:     dsa.effectiveEndDate      ?? "",
      sharingFrequencyCode: dsa.sharingFrequencyCode ?? "",
      sharingMethodCode:    dsa.sharingMethodCode    ?? "",
      dataFormatCode:       dsa.dataFormatCode       ?? "",
      entityRoleCode:       dsa.entityRoleCode       ?? "",
      isCrossBorder:        dsa.isCrossBorder        ?? false,
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

  const f = <K extends keyof typeof form>(key: K, val: typeof form[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const field = (label: string, node: React.ReactNode, required = false) => (
    <div>
      <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {node}
    </div>
  );

  const inp = (key: keyof typeof form, ph = "") => (
    <input
      className="input w-full"
      disabled={!isEditable}
      placeholder={ph}
      value={String(form[key] ?? "")}
      onChange={e => f(key, e.target.value as typeof form[typeof key])}
    />
  );

  const sel = (key: keyof typeof form, opts: { value: string; label: string }[]) => (
    <select
      className="input w-full"
      disabled={!isEditable}
      value={String(form[key] ?? "")}
      onChange={e => f(key, e.target.value as typeof form[typeof key])}
    >
      <option value="">— Select —</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">Agreement Details</h2>

        {field("Title", inp("titleText", "e.g. Sharing Employee Data with HRSD"), true)}

        <div className="grid grid-cols-2 gap-4">
          {field("Sharing Scope", sel("sharingScopeCode", SCOPES.map(s => ({ value: s, label: SCOPE_LABELS[s] }))), true)}
          {field("Direction",     sel("directionCode",    DIRECTIONS.map(d => ({ value: d, label: DIR_LABELS[d] }))), true)}
        </div>

        {field("Counterparty", inp("counterpartyNameText", "Receiving/providing organization or department"), true)}

        {field("Purpose (Legitimate Purpose)", (
          <textarea
            className="input w-full h-20 resize-none"
            disabled={!isEditable}
            placeholder="Describe the legal or business purpose for this data sharing…"
            value={form.purposeText}
            onChange={e => f("purposeText", e.target.value)}
          />
        ), true)}

        {field("Legal Basis", (
          <textarea
            className="input w-full h-16 resize-none"
            disabled={!isEditable}
            placeholder="Statute, mandate, or consent basis…"
            value={form.legalBasisText}
            onChange={e => f("legalBasisText", e.target.value)}
          />
        ), true)}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">Sharing Parameters</h2>

        <div className="grid grid-cols-2 gap-4">
          {field("Effective Start Date", (
            <input type="date" className="input w-full" disabled={!isEditable}
              value={form.effectiveStartDate}
              onChange={e => f("effectiveStartDate", e.target.value)} />
          ), true)}
          {field("Effective End Date", (
            <input type="date" className="input w-full" disabled={!isEditable}
              value={form.effectiveEndDate}
              onChange={e => f("effectiveEndDate", e.target.value)} />
          ), true)}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {field("Frequency", sel("sharingFrequencyCode", [
            { value:"ONE_TIME", label:"One-time" },
            { value:"DAILY",    label:"Daily" },
            { value:"WEEKLY",   label:"Weekly" },
            { value:"MONTHLY",  label:"Monthly" },
            { value:"ON_DEMAND",label:"On-demand" },
            { value:"REAL_TIME",label:"Real-time" },
          ]), true)}
          {field("Transfer Method", sel("sharingMethodCode", [
            { value:"API",              label:"API" },
            { value:"SFTP",             label:"SFTP" },
            { value:"GSB",              label:"GSB (Govt Service Bus)" },
            { value:"SECURE_PORTAL",    label:"Secure Portal" },
            { value:"ENCRYPTED_MEDIA",  label:"Encrypted Media" },
            { value:"DIRECT_DB_LINK",   label:"Direct DB Link" },
          ]), true)}
          {field("Data Format", sel("dataFormatCode", [
            { value:"JSON",    label:"JSON" },
            { value:"XML",     label:"XML" },
            { value:"CSV",     label:"CSV" },
            { value:"PARQUET", label:"Parquet" },
            { value:"XLSX",    label:"Excel (XLSX)" },
            { value:"PDF",     label:"PDF" },
            { value:"OTHER",   label:"Other" },
          ]), true)}
        </div>

        {field("PDPL Entity Role", sel("entityRoleCode", [
          { value:"CONTROLLER", label:"Controller — we determine the purpose" },
          { value:"PROCESSOR",  label:"Processor — we act on another Controller's behalf" },
          { value:"MIXED",      label:"Mixed — depends on the dataset" },
        ]), true)}

        <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
          <input
            type="checkbox"
            id="crossBorder"
            disabled={!isEditable}
            checked={form.isCrossBorder}
            onChange={e => f("isCrossBorder", e.target.checked)}
            className="w-4 h-4 accent-red-600"
          />
          <div>
            <label htmlFor="crossBorder" className="text-sm font-medium text-ink cursor-pointer">
              Cross-border transfer (recipient outside Saudi Arabia)
            </label>
            {form.isCrossBorder && (
              <div className="text-[11px] text-red-600 mt-0.5 font-medium">
                ⛔ Cross-border transfer is blocked in v1. This will fail the readiness check.
              </div>
            )}
          </div>
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
