"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Configuration › Ask Bayanis: what the assistant may do beyond answering.
export function AskBayanisSettingsSection() {
  const [apply, setApply] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/assistant-settings").then((r) => (r.ok ? r.json() : null)).then((s) => s && setApply(s.applyClassification));
  }, []);

  async function toggle(next: boolean) {
    setSaving(true); setError(null);
    try {
      const r = await fetch("/api/admin/assistant-settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applyClassification: next }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) { setError(res.error ?? "Couldn't save."); return; }
      setApply(res.applyClassification);
    } finally { setSaving(false); }
  }

  if (apply === null) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Ask Bayanis</h2>
          <p className="text-xs text-muted mt-1">What the assistant may do beyond answering. The model it uses is set in AI Providers.</p>
        </div>
        <Link href="/admin/ai-providers" className="btn btn-sm shrink-0">Manage AI Providers →</Link>
      </div>

      <div className="bg-white border border-line rounded-xl p-6 max-w-2xl space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5 accent-brand-purple" checked={apply} disabled={saving}
            onChange={(e) => toggle(e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-ink">Allow applying classification advice</span>
            <span className="block text-xs text-muted mt-1 leading-relaxed">
              When Ask Bayanis recommends classification terms for a table&apos;s columns, users who may edit metadata
              (administrators, stewards, and roles with metadata write) see the changes under the answer, untick any,
              confirm, and click <strong>Apply</strong>. Only terms Bayanis checked against each column are offered.
              Every change is recorded in the audit log and as a <strong>Classify Asset</strong> request, which follows
              its workflow when one is set up. When this is off, the assistant only advises and explains how to apply it by hand.
            </span>
          </span>
        </label>
        <p className={`text-xs ${apply ? "text-emerald-700" : "text-muted"}`}>
          {apply ? "On: users who may edit metadata can apply advice." : "Off: advice only."}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
