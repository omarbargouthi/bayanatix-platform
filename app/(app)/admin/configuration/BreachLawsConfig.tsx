"use client";

// Which data protection laws apply to a new breach by default: each brings its regulator
// notice and rule (lib/privacy/breach-types.ts BREACH_LAWS). A breach's handler can still
// change the laws on the breach itself.
import { useEffect, useState } from "react";
import Link from "next/link";
import { BREACH_LAWS, BREACH_REGULATIONS, type BreachRegulation } from "@/lib/privacy/breach-types";

const LAW_LABEL: Record<BreachRegulation, string> = {
  PDPL: "Saudi PDPL", GDPR: "EU GDPR", PIPEDA: "Canada PIPEDA", LAW25: "Québec Law 25",
};
const RULE: Record<BreachRegulation, string> = {
  PDPL: "72 hours, for any risk to people",
  GDPR: "72 hours, unless unlikely to result in a risk",
  PIPEDA: "As soon as feasible, for a real risk of significant harm; records kept 24 months",
  LAW25: "Promptly, for a risk of serious injury; register kept at least 5 years",
};

export function BreachLawsConfig() {
  const [saved, setSaved] = useState<BreachRegulation[] | null>(null);
  const [laws, setLaws] = useState<BreachRegulation[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const r = await fetch("/api/admin/breach-settings");
    const d = r.ok ? await r.json() : { regulations: [] };
    setSaved(d.regulations); setLaws(d.regulations);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/breach-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regulations: laws }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: "err", text: d.error ?? "Could not save" }); return; }
      setMsg({ kind: "ok", text: "Saved. New breaches start with the laws selected here." });
      await load();
    } finally { setBusy(false); }
  }

  const changed = saved && (saved.length !== laws.length || saved.some((l) => !laws.includes(l)));
  return (
    <section className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-brand-deep">Data breach laws</h3>
        <p className="text-[12px] text-muted mt-0.5">
          The data protection laws that apply to a new breach. Each one adds a notice to its regulator with that law&apos;s
          deadline and threshold; the handler can change the laws on each breach in{" "}
          <Link href="/privacy/breaches" className="text-brand-purple hover:underline">Data Privacy → Data Breaches</Link>.
        </p>
      </div>
      {!saved ? <div className="text-sm text-muted">Loading…</div> : (
        <div className="border border-line rounded-lg overflow-hidden">
          {BREACH_REGULATIONS.map((l) => (
            <label key={l} className="grid grid-cols-[40px_180px_1fr] gap-3 px-4 py-2.5 text-[13px] border-t first:border-t-0 border-line-soft items-start cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-brand-purple" checked={laws.includes(l)}
                onChange={(e) => setLaws(e.target.checked ? [...laws, l] : laws.filter((x) => x !== l))} />
              <span className="text-ink font-medium">{LAW_LABEL[l]}</span>
              <span className="text-[12px] text-muted">{BREACH_LAWS[l].authority} · {RULE[l]}</span>
            </label>
          ))}
        </div>
      )}
      {msg && <div className={`text-[13px] rounded-md px-3 py-2 border ${msg.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>{msg.text}</div>}
      <div className="flex justify-end">
        <button onClick={save} disabled={busy || !changed || laws.length === 0} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}
