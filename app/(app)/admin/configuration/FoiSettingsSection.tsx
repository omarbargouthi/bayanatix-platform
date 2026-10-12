"use client";

import { useState, useEffect, useMemo } from "react";
import { DEFAULT_FOI_CURRENCY, FOI_CURRENCY_CONFIG_KEY } from "@/lib/foi-currency";

// Shown first in the dropdown; every other ISO 4217 code follows alphabetically.
const COMMON_CURRENCIES = ["SAR", "AED", "QAR", "KWD", "BHD", "OMR", "JOD", "EGP", "USD", "EUR", "GBP", "CAD"];

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function FoiSettingsSection() {
  const [currency, setCurrency]   = useState<string | null>(null);
  const [dailyRate, setDailyRate] = useState("");
  const [reviewFee, setReviewFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const otherCurrencies = useMemo(() => {
    let all: string[] = [];
    try { all = Intl.supportedValuesOf("currency"); } catch { /* older runtime — common list only */ }
    return all.filter(c => !COMMON_CURRENCIES.includes(c));
  }, []);

  useEffect(() => {
    fetch("/api/foi/config")
      .then(r => r.ok ? r.json() : null)
      .then((d: { config?: Record<string, string> } | null) => {
        const cfg = d?.config ?? {};
        setCurrency(cfg[FOI_CURRENCY_CONFIG_KEY] ?? DEFAULT_FOI_CURRENCY);
        setDailyRate(cfg.foi_daily_rate_sar ?? "");
        setReviewFee(cfg.foi_review_fee_sar ?? "");
      })
      .catch(() => setCurrency(DEFAULT_FOI_CURRENCY));
  }, []);

  async function save() {
    if (!currency) return;
    const rate = Number(dailyRate), fee = Number(reviewFee);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(fee) || fee < 0) {
      setError("Daily rate and review fee must be zero or a positive number");
      return;
    }
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/foi/config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [FOI_CURRENCY_CONFIG_KEY]: currency,
          foi_daily_rate_sar: rate,
          foi_review_fee_sar: fee,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!currency) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink">FOI Settings</h2>
        <p className="text-xs text-muted mt-1">
          The currency used when assessing Freedom of Information requests, issuing quotes and recording
          payments. Quotes and payments keep the currency they were issued in, so changing it here only
          affects new quotes — amounts are not converted.
        </p>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-lg space-y-4">
        <div>
          <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Currency</label>
          <select className="input w-full" value={currency} onChange={e => setCurrency(e.target.value)}>
            {!COMMON_CURRENCIES.includes(currency) && !otherCurrencies.includes(currency) && (
              <option value={currency}>{currency}</option>
            )}
            <optgroup label="Common">
              {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}
            </optgroup>
            {otherCurrencies.length > 0 && (
              <optgroup label="All currencies">
                {otherCurrencies.map(c => <option key={c} value={c}>{c} — {currencyName(c)}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Daily rate ({currency})</label>
            <input type="number" min="0" step="0.01" className="input w-full" value={dailyRate} onChange={e => setDailyRate(e.target.value)} />
            <div className="text-[11px] text-muted mt-1">Effort days × this rate = quoted amount</div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase mb-1">Appeal review fee ({currency})</label>
            <input type="number" min="0" step="0.01" className="input w-full" value={reviewFee} onChange={e => setReviewFee(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-[12px] text-emerald-600 font-medium">Saved</span>}
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
