"use client";

// Which impact assessment questionnaires — that is, which regulations — the organisation
// assesses against, and the one preselected when an assessment is started.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { TemplateAdmin } from "@/lib/privacy/dpia-types";

export function DpiaQuestionnairesConfig() {
  const [items, setItems] = useState<TemplateAdmin[] | null>(null);
  const [active, setActive] = useState<number[]>([]);
  const [defaultId, setDefaultId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const r = await fetch("/api/admin/dpia-questionnaires");
    const list: TemplateAdmin[] = r.ok ? await r.json() : [];
    setItems(list);
    setActive(list.filter((t) => t.isActive).map((t) => t.templateId));
    setDefaultId(list.find((t) => t.isDefault)?.templateId ?? null);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/dpia-questionnaires", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activeIds: active, defaultId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: "err", text: d.error ?? "Could not save" }); return; }
      setMsg({ kind: "ok", text: "Saved. New impact assessments offer the questionnaires selected here." });
      await load();
    } finally { setBusy(false); }
  }

  const toggle = (id: number, on: boolean) => {
    setActive((a) => (on ? [...a, id] : a.filter((x) => x !== id)));
    if (!on && defaultId === id) setDefaultId(null);
  };
  const changed = items && (
    items.some((t) => t.isActive !== active.includes(t.templateId)) || items.find((t) => t.isDefault)?.templateId !== defaultId
  );

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-brand-deep">Impact assessment questionnaires</h3>
        <p className="text-[12px] text-muted mt-0.5">
          Choose the regulations your organisation assesses against. Only the questionnaires selected here are offered when an
          impact assessment is started, and the default is preselected. Assessments already started keep their questionnaire.
          A questionnaire linked to a compliance framework is offered only while that framework is applicable.
          The questions are edited in{" "}
          <Link href="/privacy/dpia/templates" className="text-brand-purple hover:underline">Data Privacy → Impact Assessments → Questionnaires</Link>.
        </p>
      </div>
      {!items ? <div className="text-sm text-muted">Loading…</div> : (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-[70px_1fr_150px_80px] gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-muted font-bold bg-canvas-soft">
            <span>In use</span><span>Questionnaire</span><span>Questions</span><span>Default</span>
          </div>
          {items.map((t) => {
            const on = active.includes(t.templateId);
            return (
              <div key={t.templateId} className="grid grid-cols-[70px_1fr_150px_80px] gap-3 px-4 py-2.5 text-[13px] border-t border-line-soft items-center">
                <input type="checkbox" checked={on} disabled={t.screeningCount === 0} aria-label={`Use ${t.name}`}
                  title={t.screeningCount === 0 ? "Add a screening question first" : undefined}
                  onChange={(e) => toggle(t.templateId, e.target.checked)} />
                <div>
                  <div className="text-ink font-medium">{t.name}</div>
                  {t.regulation && <div className="text-[12px] text-muted">{t.regulation}</div>}
                  {t.frameworkId != null && (
                    <div className={`text-[11px] mt-0.5 ${t.frameworkApplicable ? "text-muted" : "text-amber-700 font-semibold"}`}>
                      Compliance framework: <Link href={`/governance/compliance?fw=${t.frameworkId}`} className="text-brand-purple hover:underline">{t.frameworkName}</Link>
                      {t.frameworkApplicable ? " · applicable" : <> · not applicable, so not offered. Turn it on in <Link href="/admin/maturity-index-setup" className="text-brand-purple hover:underline">Regulation Setup</Link>.</>}
                    </div>
                  )}
                </div>
                <span className="text-[12px] text-muted">{t.screeningCount} screening · {t.assessmentCount} assessment</span>
                <input type="radio" name="dpia-default" checked={defaultId === t.templateId} disabled={!on} aria-label={`Default: ${t.name}`}
                  onChange={() => setDefaultId(t.templateId)} />
              </div>
            );
          })}
        </div>
      )}
      {msg && <div className={`text-[13px] rounded-md px-3 py-2 border ${msg.kind === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"}`}>{msg.text}</div>}
      <div className="flex justify-end">
        <button onClick={save} disabled={busy || !changed || !active.length || defaultId == null} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}
