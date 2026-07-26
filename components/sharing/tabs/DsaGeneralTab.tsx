"use client";

import { useState, useEffect } from "react";
import type { DsaDetail } from "@/lib/queries/sharing";
import { useLang } from "@/lib/lang-context";
import { scopeLabels } from "@/lib/sharing-routing";
import type { I18nStrings } from "@/lib/i18n/strings";

type Props = {
  dsaId:      number | null;
  dsa:        DsaDetail | null;
  isEditable: boolean;
  onSaved:    () => void;
};

const SCOPES = ["INTERNAL","EXTERNAL_GOV","EXTERNAL_PRIVATE"];

function getDirections(scope: string, s: I18nStrings["sharing"]) {
  const base = [
    { value: "PROVIDER",      label: s.general.directionProviderFull },
    { value: "REQUESTER",     label: s.general.directionRequesterFull },
  ];
  if (scope !== "INTERNAL") {
    base.push({ value: "BIDIRECTIONAL", label: s.general.directionBidirectionalFull });
  }
  return base;
}

export function DsaGeneralTab({ dsaId, dsa, isEditable, onSaved }: Props) {
  const { t } = useLang();
  const s = t.sharing;
  const SCOPE_LABELS = scopeLabels(s);
  const [form, setForm] = useState({
    titleText:            dsa?.titleText            ?? "",
    sharingScopeCode:     dsa?.sharingScopeCode     ?? "INTERNAL",
    directionCode:        dsa?.directionCode        ?? "PROVIDER",
    fromDepartmentText:   dsa?.fromDepartmentText   ?? "",
    toDepartmentText:     dsa?.toDepartmentText     ?? "",
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
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (dsa) setForm({
      titleText:            dsa.titleText            ?? "",
      sharingScopeCode:     dsa.sharingScopeCode     ?? "INTERNAL",
      directionCode:        dsa.directionCode        ?? "PROVIDER",
      fromDepartmentText:   dsa.fromDepartmentText   ?? "",
      toDepartmentText:     dsa.toDepartmentText     ?? "",
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
    setSaveError(null);
    try {
      const r = await fetch(`/api/sharing/dsas/${dsaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? `Server error (HTTP ${r.status})`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : s.unexpectedError);
    } finally {
      setSaving(false);
    }
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
      <option value="">{s.selectPlaceholder}</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const isInternal = form.sharingScopeCode === "INTERNAL";
  const g = s.general;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">{g.sectionDetails}</h2>

        {field(g.fieldTitle, inp("titleText", g.fieldTitlePh), true)}

        <div className="grid grid-cols-2 gap-4">
          {field(g.fieldScope, (
            <select
              className="input w-full"
              disabled={!isEditable}
              value={form.sharingScopeCode}
              onChange={e => {
                const scope = e.target.value;
                // Reset direction to PROVIDER if switching to INTERNAL from a scope that had BIDIRECTIONAL
                const directionCode = scope === "INTERNAL" && form.directionCode === "BIDIRECTIONAL"
                  ? "PROVIDER"
                  : form.directionCode;
                setForm(prev => ({ ...prev, sharingScopeCode: scope, directionCode }));
              }}
            >
              {SCOPES.map(sc => <option key={sc} value={sc}>{SCOPE_LABELS[sc]}</option>)}
            </select>
          ), true)}
          {field(g.fieldDirection, sel("directionCode", getDirections(form.sharingScopeCode, s)), true)}
        </div>

        {/* Department fields — Internal scope only */}
        {isInternal && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div>
              <p className="text-[10px] font-bold text-blue-700 uppercase mb-2">{g.internalParties}</p>
            </div>
            <div></div>
            {field(g.fieldFromDept, inp("fromDepartmentText", g.fieldFromDeptPh), true)}
            {field(g.fieldToDept,   inp("toDepartmentText",   g.fieldToDeptPh), true)}
          </div>
        )}

        {/* Counterparty — external scopes only */}
        {!isInternal && field(
          g.fieldCounterparty,
          inp("counterpartyNameText", g.fieldCounterpartyPh),
          true,
        )}

        {field(g.fieldPurpose, (
          <textarea
            className="input w-full h-20 resize-none"
            disabled={!isEditable}
            placeholder={g.fieldPurposePh}
            value={form.purposeText}
            onChange={e => f("purposeText", e.target.value)}
          />
        ), true)}

        {field(g.fieldLegalBasis, (
          <textarea
            className="input w-full h-16 resize-none"
            disabled={!isEditable}
            placeholder={g.fieldLegalBasisPh}
            value={form.legalBasisText}
            onChange={e => f("legalBasisText", e.target.value)}
          />
        ), true)}
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-ink text-sm">{g.sectionParams}</h2>

        <div className="grid grid-cols-2 gap-4">
          {field(g.fieldStart, (
            <input type="date" className="input w-full" disabled={!isEditable}
              value={form.effectiveStartDate}
              onChange={e => f("effectiveStartDate", e.target.value)} />
          ), true)}
          {field(g.fieldEnd, (
            <input type="date" className="input w-full" disabled={!isEditable}
              value={form.effectiveEndDate}
              onChange={e => f("effectiveEndDate", e.target.value)} />
          ), true)}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {field(g.fieldFrequency, sel("sharingFrequencyCode", [
            { value:"ONE_TIME", label:s.freq.oneTime },
            { value:"DAILY",    label:s.freq.daily },
            { value:"WEEKLY",   label:s.freq.weekly },
            { value:"MONTHLY",  label:s.freq.monthly },
            { value:"ON_DEMAND",label:s.freq.onDemand },
            { value:"REAL_TIME",label:s.freq.realTime },
          ]), true)}
          {field(g.fieldMethod, sel("sharingMethodCode", [
            { value:"API",              label:s.method.api },
            { value:"SFTP",             label:s.method.sftp },
            { value:"GSB",              label:s.method.gsb },
            { value:"SECURE_PORTAL",    label:s.method.securePortal },
            { value:"ENCRYPTED_MEDIA",  label:s.method.encryptedMedia },
            { value:"DIRECT_DB_LINK",   label:s.method.directDbLink },
          ]), true)}
          {field(g.fieldFormat, sel("dataFormatCode", [
            { value:"JSON",    label:s.format.json },
            { value:"XML",     label:s.format.xml },
            { value:"CSV",     label:s.format.csv },
            { value:"PARQUET", label:s.format.parquet },
            { value:"XLSX",    label:s.format.xlsx },
            { value:"PDF",     label:s.format.pdf },
            { value:"OTHER",   label:s.format.other },
          ]), true)}
        </div>

        {field(g.fieldPdplRole, sel("entityRoleCode", [
          { value:"CONTROLLER", label:g.roleController },
          { value:"PROCESSOR",  label:g.roleProcessor },
          { value:"MIXED",      label:g.roleMixed },
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
              {g.crossBorderLabel}
            </label>
            {form.isCrossBorder && (
              <div className="text-[11px] text-red-600 mt-0.5 font-medium">
                {g.crossBorderWarning}
              </div>
            )}
          </div>
        </div>
      </div>

      {isEditable && (
        <div className="flex flex-col items-end gap-2">
          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 w-full">{saveError}</p>
          )}
          <button onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? t.common.saving : saved ? s.savedCheck : t.common.save}
          </button>
        </div>
      )}
    </div>
  );
}
