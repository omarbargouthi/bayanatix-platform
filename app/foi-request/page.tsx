"use client";

import { useState } from "react";

const DOMAINS_FALLBACK = [
  "Finance", "Human Resources", "Operations", "Legal", "IT",
  "Customer Service", "Procurement", "Strategy", "Other",
];

const FORMAT_HINTS = ["Number", "Text", "Date", "SAR Amount", "Percentage", "Yes / No", "File / Document", "Other"];

type AttributeRow = { name: string; description: string; formatHint: string };

function newRow(): AttributeRow { return { name: "", description: "", formatHint: "" }; }

export default function FoiSubmitPage() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [result, setResult] = useState<{ referenceCode: string; accessToken: string; trackingUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    requesterType: "INDIVIDUAL",
    fullName: "", email: "", phone: "", nationalId: "",
    preferredLanguage: "ar",
    subject: "", description: "",
    domainCode: "", requestedFormat: "PDF",
  });
  const [attributes, setAttributes] = useState<AttributeRow[]>([newRow()]);

  const f = (key: keyof typeof form, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  function updateAttr(idx: number, field: keyof AttributeRow, val: string) {
    setAttributes(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }
  function addAttr() { setAttributes(prev => [...prev, newRow()]); }
  function removeAttr(idx: number) { setAttributes(prev => prev.filter((_, i) => i !== idx)); }

  async function submit() {
    if (!form.fullName.trim()) { setError("Full name is required"); return; }
    if (!form.email.trim())    { setError("Email is required"); return; }
    if (!form.subject.trim())  { setError("Subject is required"); return; }
    if (!form.description.trim()) { setError("Description is required"); return; }
    const filledAttrs = attributes.filter(a => a.name.trim());
    if (filledAttrs.length === 0) { setError("Please add at least one data attribute you need"); return; }

    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/foi/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          domainCode: form.domainCode || null,
          channel: "PORTAL",
          attributes: filledAttrs,
        }),
      });
      const payload = await r.json();
      if (!r.ok) { setError(payload.error ?? "Submission failed — please try again"); return; }
      setResult(payload);
      setStep("success");
    } catch {
      setError("Network error — please check your connection and try again");
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
          <h1 className="text-2xl font-bold text-gray-900">Freedom of Information Request</h1>
          <p className="text-gray-500 mt-1 text-sm">Submit a request for access to public information. We will process your request within 30 business days.</p>
        </div>

        {step === "form" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">

            {/* Requester type */}
            <div className="flex gap-3">
              {["INDIVIDUAL","ORGANIZATION"].map(t => (
                <button key={t} onClick={() => f("requesterType", t)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.requesterType === t ? "border-brand-purple bg-brand-purple/5 text-brand-purple" : "border-gray-200 text-gray-600 hover:border-brand-purple/50"
                  }`}>
                  {t === "INDIVIDUAL" ? "👤 Individual" : "🏢 Organization"}
                </button>
              ))}
            </div>

            {/* Requester info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  {form.requesterType === "ORGANIZATION" ? "Organization Name" : "Full Name"} <span className="text-red-500">*</span>
                </label>
                <input className="input w-full" value={form.fullName} onChange={e => f("fullName", e.target.value)} placeholder="Your full name" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  {form.requesterType === "ORGANIZATION" ? "CR / License No." : "National ID"} (optional)
                </label>
                <input className="input w-full" value={form.nationalId} onChange={e => f("nationalId", e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email Address <span className="text-red-500">*</span></label>
                <input type="email" className="input w-full" value={form.email} onChange={e => f("email", e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Phone (optional)</label>
                <input type="tel" className="input w-full" value={form.phone} onChange={e => f("phone", e.target.value)} placeholder="+966 5X XXX XXXX" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Preferred Language</label>
                <select className="input w-full" value={form.preferredLanguage} onChange={e => f("preferredLanguage", e.target.value)}>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Preferred Format</label>
                <select className="input w-full" value={form.requestedFormat} onChange={e => f("requestedFormat", e.target.value)}>
                  {["PDF","XLSX","CSV","JSON","PAPER"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Request info */}
            <div className="pt-2 border-t border-gray-100 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Subject / Title <span className="text-red-500">*</span></label>
                <input className="input w-full" value={form.subject} onChange={e => f("subject", e.target.value)} placeholder="Brief title of the information you are requesting" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Description <span className="text-red-500">*</span></label>
                <textarea className="input w-full h-24 resize-none" value={form.description} onChange={e => f("description", e.target.value)}
                  placeholder="Describe the specific information you need — what, time period, scope, intended use…" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Business Domain (optional)</label>
                <select className="input w-full" value={form.domainCode} onChange={e => f("domainCode", e.target.value)}>
                  <option value="">— Select if known —</option>
                  {DOMAINS_FALLBACK.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Structured attributes */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Data Attributes Needed <span className="text-red-500">*</span></h3>
                <p className="text-xs text-gray-500 mt-0.5">List each specific piece of information you need. The more detail you provide, the faster we can process your request.</p>
              </div>

              <div className="space-y-3">
                {attributes.map((attr, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                    <div className="flex items-start gap-2">
                      <span className="w-6 h-6 flex-shrink-0 bg-brand-purple text-white text-[11px] font-bold rounded-full flex items-center justify-center mt-1">{idx + 1}</span>
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Attribute / Field Name <span className="text-red-500">*</span></label>
                          <input className="input w-full text-sm" value={attr.name} onChange={e => updateAttr(idx, "name", e.target.value)}
                            placeholder="e.g. Employee Count, Budget by Department, Invoice Total…" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Description / Purpose</label>
                          <input className="input w-full text-sm" value={attr.description} onChange={e => updateAttr(idx, "description", e.target.value)}
                            placeholder="Why do you need this? What level of detail? Which time period?" />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Expected Format / Type</label>
                            <select className="input w-full text-sm" value={attr.formatHint} onChange={e => updateAttr(idx, "formatHint", e.target.value)}>
                              <option value="">— Select format —</option>
                              {FORMAT_HINTS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                          {attributes.length > 1 && (
                            <button onClick={() => removeAttr(idx)} className="mt-5 text-red-400 hover:text-red-600 text-xs font-semibold">Remove</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addAttr} disabled={attributes.length >= 20}
                className="w-full py-2 rounded-lg border-2 border-dashed border-brand-purple/30 text-brand-purple text-sm font-medium hover:border-brand-purple/60 transition-colors">
                + Add Another Attribute
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="pt-2">
              <button onClick={submit} disabled={submitting} className="w-full btn btn-primary py-3 text-base">
                {submitting ? "Submitting…" : "Submit Information Request"}
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">
                By submitting you acknowledge your request will be processed under the NDMO Freedom of Information Interim Regulations.
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
            <h2 className="text-xl font-bold text-gray-900">Request Submitted</h2>
            <p className="text-gray-500 text-sm">Your request has been registered. We will process it within <strong>30 business days</strong>.</p>

            <div className="bg-gray-50 rounded-xl p-5 space-y-3">
              <div>
                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Your Reference Number</div>
                <div className="text-2xl font-mono font-bold text-brand-purple">{result.referenceCode}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Track Your Request</div>
                <a href={result.trackingUrl} className="text-sm text-brand-purple hover:underline font-medium">
                  {window.location.origin + result.trackingUrl}
                </a>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 text-left">
              <strong>Important:</strong> Save your tracking link. It is the only way to monitor your request status and accept or decline any quote. Keep your reference number safe.
            </div>

            <button onClick={() => {
              setStep("form"); setResult(null);
              setForm({ requesterType:"INDIVIDUAL", fullName:"", email:"", phone:"", nationalId:"", preferredLanguage:"ar", subject:"", description:"", domainCode:"", requestedFormat:"PDF" });
              setAttributes([newRow()]);
            }} className="btn btn-sm text-gray-500">Submit Another Request</button>
          </div>
        )}
      </div>
    </div>
  );
}
