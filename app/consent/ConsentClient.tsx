"use client";

import { useState } from "react";

// Labels are fixed bilingual strings (this page sits outside the app shell and its
// language provider); the notice itself is the admin-authored text for the language.
const LABELS = {
  en: { hello: "Hello {name}.", intro: "Before you continue, please read and accept this notice.", version: "Version {n}", accept: "I accept", decline: "Decline and sign out", agree: "I have read and understood this notice.", saving: "Saving…", failed: "Could not save your decision. Please try again." },
  ar: { hello: "مرحباً {name}،", intro: "قبل المتابعة، يرجى قراءة هذا الإشعار والموافقة عليه.", version: "الإصدار {n}", accept: "أوافق", decline: "رفض وتسجيل الخروج", agree: "قرأت هذا الإشعار وفهمته.", saving: "جارٍ الحفظ…", failed: "تعذر حفظ قرارك. يرجى المحاولة مرة أخرى." },
};

export function ConsentClient({ lang, userName, title, text, version }: {
  lang: "en" | "ar"; userName: string; title: string; text: string; version: number;
}) {
  const L = LABELS[lang];
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "ACCEPTED" | "DECLINED") {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      if (!r.ok) { setError(L.failed); return; }
      if (decision === "DECLINED") {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      } else {
        window.location.href = "/homepage";
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white border border-line rounded-2xl shadow-xl">
        <div className="flex items-center gap-3 px-8 pt-7 pb-5 border-b border-line">
          <img src="/logo.svg" alt="" className="w-7 h-9" />
          <span className="font-bold tracking-[0.18em] text-brand-deep">BAYANIS</span>
        </div>
        <div className="px-8 py-6 space-y-4">
          <div>
            <p className="text-sm text-ink-soft">{L.hello.replace("{name}", userName)} {L.intro}</p>
            <h1 className="text-xl font-bold text-brand-deep mt-3">{title}</h1>
            <p className="text-[11px] text-muted mt-0.5">{L.version.replace("{n}", String(version))}</p>
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line-soft bg-canvas-soft px-5 py-4 text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
            {text}
          </div>
          <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-brand-purple" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            {L.agree}
          </label>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>
        <div className="flex items-center justify-between gap-3 px-8 py-5 border-t border-line">
          <button onClick={() => decide("DECLINED")} disabled={busy} className="btn btn-sm">{L.decline}</button>
          <button onClick={() => decide("ACCEPTED")} disabled={busy || !agreed} className="btn btn-primary">{busy ? L.saving : L.accept}</button>
        </div>
      </div>
    </div>
  );
}
