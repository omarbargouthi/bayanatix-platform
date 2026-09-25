"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang-context";
import { FoiLangBar } from "./FoiLangBar";

type AttributeRow = { name: string; description: string; formatHint: string };

function newRow(): AttributeRow { return { name: "", description: "", formatHint: "" }; }

function FoiSubmitPageInner() {
  const { t } = useLang();
  const c = t.foi.public.intake;

  const FORMAT_HINTS = [
    { value: "Number", label: c.formatNumber },
    { value: "Text", label: c.formatText },
    { value: "Date", label: c.formatDate },
    { value: "SAR Amount", label: c.formatSarAmount },
    { value: "Percentage", label: c.formatPercentage },
    { value: "Yes / No", label: c.formatYesNo },
    { value: "File / Document", label: c.formatFile },
    { value: "Other", label: c.formatOther },
  ];

  const [step, setStep] = useState<"form" | "success">("form");
  const [result, setResult] = useState<{ referenceCode: string; accessToken: string; trackingUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    requesterType: "INDIVIDUAL",
    fullName: "", email: "", phone: "", nationalId: "",
    preferredLanguage: "ar",
    subject: "", description: "",
    requestedFormat: "PDF",
  });
  const [attributes, setAttributes] = useState<AttributeRow[]>([newRow()]);

  const f = (key: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  function updateAttr(idx: number, field: keyof AttributeRow, val: string) {
    setAttributes(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function addAttr() { setAttributes(prev => [...prev, newRow()]); }
  function removeAttr(idx: number) { setAttributes(prev => prev.filter((_, i) => i !== idx)); }

  async function submit() {
    if (!form.fullName.trim()) { setError(c.fullNameRequired); return; }
    if (!form.email.trim())    { setError(c.emailRequired); return; }
    if (!form.subject.trim())  { setError(c.subjectRequired); return; }
    if (!form.description.trim()) { setError(c.descriptionRequired); return; }
    const filledAttrs = attributes.filter(a => a.name.trim());
    if (filledAttrs.length === 0) { setError(c.atLeastOneAttr); return; }

    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/foi/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          domainCode: null,
          channel: "PORTAL",
          attributes: filledAttrs,
        }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? c.submissionFailed); return; }
      setResult(payload);
      setStep("success");
    } catch {
      setError(c.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-purple/10 mb-4">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-brand-purple" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{c.pageTitle}</h1>
          <p className="text-gray-500 mt-1 text-sm">{c.pageDesc}</p>
        </div>

        {step === "form" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">

            {/* Requester type */}
            <div className="flex gap-3">
              {["INDIVIDUAL","ORGANIZATION"].map(type => (
                <button key={type} onClick={() => f("requesterType", type)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.requesterType === type ? "border-brand-purple bg-brand-purple/5 text-brand-purple" : "border-gray-200 text-gray-600 hover:border-brand-purple/50"
                  }`}>
                  {type === "INDIVIDUAL" ? c.individualType : c.organizationType}
                </button>
              ))}
            </div>

            {/* Requester info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  {form.requesterType === "ORGANIZATION" ? c.orgNameLabel : c.fullNameLabel} <span className="text-red-500">*</span>
                </label>
                <input className="input w-full" dir="auto" value={form.fullName} onChange={e => f("fullName", e.target.value)} placeholder={c.fullNameLabel} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  {form.requesterType === "ORGANIZATION" ? c.crNumberLabel : c.nationalIdLabel} {c.optionalSuffix}
                </label>
                <input className="input w-full" dir="auto" value={form.nationalId} onChange={e => f("nationalId", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.emailLabel} <span className="text-red-500">*</span></label>
                <input type="email" className="input w-full" dir="ltr" value={form.email} onChange={e => f("email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.phoneLabel}</label>
                <input type="tel" className="input w-full" dir="ltr" value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="+966 5X XXX XXXX" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.preferredLangLabel}</label>
                <select className="input w-full" value={form.preferredLanguage} onChange={e => f("preferredLanguage", e.target.value)}>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.preferredFormatLabel}</label>
                <select className="input w-full" value={form.requestedFormat} onChange={e => f("requestedFormat", e.target.value)}>
                  {["PDF","XLSX","CSV","JSON","PAPER"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Request info */}
            <div className="pt-2 border-t border-gray-100 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.subjectLabel} <span className="text-red-500">*</span></label>
                <input className="input w-full" dir="auto" value={form.subject} onChange={e => f("subject", e.target.value)} placeholder={c.subjectPlaceholder} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{c.descriptionLabel} <span className="text-red-500">*</span></label>
                <textarea className="input w-full h-24 resize-none" dir="auto" value={form.description} onChange={e => f("description", e.target.value)}
                  placeholder={c.descriptionPlaceholder} />
              </div>
            </div>

            {/* Structured attributes */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{c.attrsTitle} <span className="text-red-500">*</span></h3>
                <p className="text-xs text-gray-500 mt-0.5">{c.attrsDesc}</p>
              </div>

              <div className="space-y-3">
                {attributes.map((attr, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 flex-shrink-0 bg-brand-purple text-white text-[11px] font-bold rounded-full flex items-center justify-center mt-1">{idx + 1}</span>
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{c.attrNameLabel} <span className="text-red-500">*</span></label>
                          <input className="input w-full text-sm" dir="auto" value={attr.name} onChange={e => updateAttr(idx, "name", e.target.value)}
                            placeholder={c.attrNamePlaceholder} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{c.attrDescLabel}</label>
                          <input className="input w-full text-sm" dir="auto" value={attr.description} onChange={e => updateAttr(idx, "description", e.target.value)}
                            placeholder={c.attrDescPlaceholder} />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{c.attrFormatLabel}</label>
                            <select className="input w-full text-sm" value={attr.formatHint} onChange={e => updateAttr(idx, "formatHint", e.target.value)}>
                              <option value="">{c.selectFormatPlaceholder}</option>
                              {FORMAT_HINTS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                            </select>
                          </div>
                          {attributes.length > 1 && (
                            <button onClick={() => removeAttr(idx)} className="mt-5 text-red-400 hover:text-red-600 text-xs font-semibold">{c.remove}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addAttr} disabled={attributes.length >= 20}
                className="w-full py-2 rounded-lg border-2 border-dashed border-brand-purple/30 text-brand-purple text-sm font-medium hover:border-brand-purple/60 transition-colors">
                {c.addAnotherAttr}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="pt-2">
              <button onClick={submit} disabled={submitting} className="w-full btn btn-primary py-3 text-base">
                {submitting ? c.submitting : c.submitRequest}
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">
                {c.legalNote}
              </p>
            </div>
          </div>
        )}

        {step === "success" && result && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">{c.successTitle}</h2>
            <p className="text-gray-500 text-sm">{c.successDesc}</p>

            <div className="bg-gray-50 rounded-xl p-5 space-y-3">
              <div>
                <div className="text-xs text-gray-500 uppercase font-bold mb-1">{c.referenceLabel}</div>
                <div className="text-2xl font-mono font-bold text-brand-purple" dir="ltr">{result.referenceCode}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-bold mb-1">{c.trackLabel}</div>
                <a href={result.trackingUrl} dir="ltr" className="text-sm text-brand-purple hover:underline font-medium break-all">
                  {window.location.origin + result.trackingUrl}
                </a>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 text-start">
              <strong>{c.importantNote}</strong>
            </div>

            <button onClick={() => {
              setStep("form"); setResult(null);
              setForm({ requesterType:"INDIVIDUAL", fullName:"", email:"", phone:"", nationalId:"", preferredLanguage:"ar", subject:"", description:"", requestedFormat:"PDF" });
              setAttributes([newRow()]);
            }} className="btn btn-sm text-gray-500">{c.submitAnother}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FoiSubmitPage() {
  return (
    <FoiLangBar>
      <FoiSubmitPageInner />
    </FoiLangBar>
  );
}
