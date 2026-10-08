"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang-context";

// A regulation's registration (db/162, db/163): its name and version, how it is
// assessed, where it applies, who issues or enforces it, since when, and where the
// official text is. The summary sits under the regulation's name on the Compliance
// page; one form (RegulationForm) is used both to register a new regulation and to
// edit an existing one, so the two always ask for the same information.

export type RegulationLink = { label: string; url: string };
export type AssessmentMode = "COMPLIANCE_ONLY" | "MATURITY";
export type RegulationDetailsData = {
  frameworkId: number;
  name: string;
  code: string;
  version: string | null;
  description: string | null;
  assessmentMode: AssessmentMode;
  reqCount: number;
  regionName: string | null;
  countriesInScope: string | null;
  scopeNote: string | null;
  regulatoryBody: string | null;
  effectiveDate: string | null;
  effectiveDateNote: string | null;
  officialUrl: string | null;
  referenceLinks: RegulationLink[];
};

// Labels come from the "Assessment Mode" lookup group (Administration > Configuration),
// so they can be reworded or translated there; these are only the fallback.
const MODE_FALLBACK: Record<AssessmentMode, string> = { COMPLIANCE_ONLY: "Compliance checklist", MATURITY: "Maturity (levels 0–5)" };
function useModeLabel() {
  const { lookupLabel } = useLang();
  return (m: AssessmentMode) => { const l = lookupLabel("ASSESSMENT_MODE", m); return l && l !== m ? l : MODE_FALLBACK[m]; };
}

const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const codeFromName = (name: string) => name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

function ExternalLink({ url, label }: RegulationLink) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-purple hover:underline break-all" dir="ltr">
      {label} ↗
    </a>
  );
}

export function RegulationDetails({ details, canEdit, onSaved }: { details: RegulationDetailsData; canEdit: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const modeLabel = useModeLabel();
  const d = details;

  const summary = [d.regulatoryBody, d.countriesInScope ?? d.regionName, d.effectiveDate ? `In force ${fmtDate(d.effectiveDate)}` : null, modeLabel(d.assessmentMode)].filter(Boolean) as string[];

  return (
    <div className="mt-2 text-[12px]">
      <div className="flex items-center gap-2 flex-wrap text-ink-soft">
        {summary.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <span className="text-muted">·</span>}<span dir="auto">{s}</span>
          </span>
        ))}
        <button onClick={() => setOpen((v) => !v)} className="text-brand-purple font-medium hover:underline">{open ? "Hide details" : "Regulation details"}</button>
        {canEdit && <button onClick={() => setEditing(true)} className="text-brand-purple font-medium hover:underline">Edit</button>}
      </div>

      {open && (
        <dl className="mt-3 grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 max-w-3xl rounded-lg border border-line bg-white px-4 py-3">
          <dt className="text-muted">Name</dt><dd className="text-ink" dir="auto">{d.name}{d.version ? ` · ${d.version}` : ""} <span className="text-muted font-mono text-[11px]" dir="ltr">({d.code})</span></dd>
          {d.description && (<><dt className="text-muted">Description</dt><dd className="text-ink leading-snug" dir="auto">{d.description}</dd></>)}
          <dt className="text-muted">Assessment mode</dt><dd className="text-ink">{modeLabel(d.assessmentMode)}</dd>
          {d.regulatoryBody && (<><dt className="text-muted">Regulatory body</dt><dd className="text-ink" dir="auto">{d.regulatoryBody}</dd></>)}
          {d.regionName && (<><dt className="text-muted">Region</dt><dd className="text-ink" dir="auto">{d.regionName}</dd></>)}
          {d.countriesInScope && (<><dt className="text-muted">Countries in scope</dt><dd className="text-ink" dir="auto">{d.countriesInScope}</dd></>)}
          {d.scopeNote && (<><dt className="text-muted">Applies to</dt><dd className="text-ink leading-snug" dir="auto">{d.scopeNote}</dd></>)}
          {(d.effectiveDate || d.effectiveDateNote) && (
            <>
              <dt className="text-muted">Effective date</dt>
              <dd className="text-ink leading-snug" dir="auto">
                {d.effectiveDate && <span className="font-semibold">{fmtDate(d.effectiveDate)}</span>}
                {d.effectiveDate && d.effectiveDateNote && <span> — </span>}
                {d.effectiveDateNote}
              </dd>
            </>
          )}
          {(d.officialUrl || d.referenceLinks.length > 0) && (
            <>
              <dt className="text-muted">Official references</dt>
              <dd className="flex flex-col gap-1">
                {d.officialUrl && <ExternalLink url={d.officialUrl} label={`Official text or site (${hostOf(d.officialUrl)})`} />}
                {d.referenceLinks.map((l, i) => <ExternalLink key={i} url={l.url} label={l.label || hostOf(l.url)} />)}
              </dd>
            </>
          )}
        </dl>
      )}

      {editing && <RegulationForm details={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setOpen(true); onSaved(); }} />}
    </div>
  );
}

/** The one form for a regulation: `details` given = edit it; omitted = register a new one. */
export function RegulationForm({ details, onClose, onSaved }: {
  details?: RegulationDetailsData; onClose: () => void; onSaved: (frameworkId: number) => void;
}) {
  const isNew = !details;
  const modeLabel = useModeLabel();
  const [f, setF] = useState({
    name: details?.name ?? "", code: details?.code ?? "", version: details?.version ?? "", description: details?.description ?? "",
    assessmentMode: (details?.assessmentMode ?? "COMPLIANCE_ONLY") as AssessmentMode,
    regionName: details?.regionName ?? "", countriesInScope: details?.countriesInScope ?? "", scopeNote: details?.scopeNote ?? "",
    regulatoryBody: details?.regulatoryBody ?? "", effectiveDate: details?.effectiveDate?.slice(0, 10) ?? "",
    effectiveDateNote: details?.effectiveDateNote ?? "", officialUrl: details?.officialUrl ?? "",
  });
  const [codeTouched, setCodeTouched] = useState(!isNew);
  const [links, setLinks] = useState<RegulationLink[]>(details?.referenceLinks ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  // The mode decides how requirements are scored, so it is fixed once there are any.
  const modeLocked = !isNew && (details?.reqCount ?? 0) > 0;

  async function save() {
    const cleanLinks = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url);
    if (!f.name.trim()) { setError("A name is required."); return; }
    if (isNew && !f.code.trim()) { setError("A code is required."); return; }
    if (f.officialUrl.trim() && !isHttpUrl(f.officialUrl)) { setError("The official link must start with http:// or https://"); return; }
    if (cleanLinks.some((l) => !isHttpUrl(l.url))) { setError("Every reference link must start with http:// or https://"); return; }
    setSaving(true); setError(null);
    try {
      const body = { ...f, referenceLinks: cleanLinks };
      const r = isNew
        ? await fetch("/api/governance/compliance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/governance/compliance/${details!.frameworkId}/details`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b.error ?? "The regulation could not be saved."); return; }
      onSaved(isNew ? Number(b.frameworkId) : details!.frameworkId);
    } finally { setSaving(false); }
  }

  const input = "w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple disabled:bg-canvas-soft disabled:text-muted";
  const label = "block text-[11px] uppercase tracking-wider text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-[680px] border border-line text-[13px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-bold text-brand-deep text-base">{isNew ? "New regulation" : "Regulation details"}</h2>
            {isNew && <p className="text-[11px] text-muted mt-0.5">Registers the regulation: it appears on Governance Framework › Regulatory and can then be assessed here. Import its requirements afterwards.</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-[1fr_190px_110px] gap-4">
            <div>
              <label className={label}>Name *</label>
              <input className={input} value={f.name} placeholder="e.g. PIPEDA"
                onChange={(e) => { const v = e.target.value; setF((cur) => ({ ...cur, name: v, code: codeTouched ? cur.code : codeFromName(v) })); }} />
            </div>
            <div>
              <label className={label}>Code {isNew ? "*" : ""}</label>
              <input className={`${input} font-mono`} dir="ltr" value={f.code} disabled={!isNew} title={isNew ? "Short identifier, fixed once created" : "The code is fixed once the regulation is created"}
                onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")); }} />
            </div>
            <div>
              <label className={label}>Version</label>
              <input className={input} value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.0" />
            </div>
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={input} rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <label className={label}>Assessment mode</label>
            <select className={input} value={f.assessmentMode} disabled={modeLocked} onChange={(e) => set("assessmentMode", e.target.value as AssessmentMode)}>
              <option value="COMPLIANCE_ONLY">{modeLabel("COMPLIANCE_ONLY")}</option>
              <option value="MATURITY">{modeLabel("MATURITY")}</option>
            </select>
            <p className="text-[11px] text-muted mt-1">
              {modeLocked
                ? `Fixed: this regulation already has ${details!.reqCount} requirement(s), which are scored in this mode.`
                : "Compliance checklist: each requirement is met, partly met or not met. Maturity: requirements are grouped into levels 0–5 per standard. It can be changed until requirements are added."}
            </p>
          </div>
          <div>
            <label className={label}>Regulatory body</label>
            <input className={input} value={f.regulatoryBody} onChange={(e) => set("regulatoryBody", e.target.value)} placeholder="Who issues or enforces it" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Region</label>
              <input className={input} value={f.regionName} onChange={(e) => set("regionName", e.target.value)} placeholder="Middle East, North America, Global…" />
            </div>
            <div>
              <label className={label}>Countries in scope</label>
              <input className={input} value={f.countriesInScope} onChange={(e) => set("countriesInScope", e.target.value)} placeholder="Comma-separated" />
            </div>
          </div>
          <div>
            <label className={label}>Applies to</label>
            <textarea className={input} rows={2} value={f.scopeNote} onChange={(e) => set("scopeNote", e.target.value)} placeholder="Which organisations or activities it covers" />
          </div>
          <div className="grid grid-cols-[180px_1fr] gap-4">
            <div>
              <label className={label}>Effective date</label>
              <input type="date" className={input} value={f.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} />
            </div>
            <div>
              <label className={label}>Effective date note</label>
              <input className={input} value={f.effectiveDateNote} onChange={(e) => set("effectiveDateNote", e.target.value)} placeholder="Phases, deadlines, or the year when no exact date applies" />
            </div>
          </div>
          <div>
            <label className={label}>Official text or site</label>
            <input className={input} dir="ltr" value={f.officialUrl} onChange={(e) => set("officialUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={label}>Other reference links</label>
              <button type="button" onClick={() => setLinks((l) => [...l, { label: "", url: "" }])} className="text-[12px] text-brand-purple font-medium hover:underline">+ Add link</button>
            </div>
            <div className="space-y-2">
              {links.length === 0 && <div className="text-[12px] text-muted">None.</div>}
              {links.map((l, i) => (
                <div key={i} className="grid grid-cols-[200px_1fr_auto] gap-2 items-center">
                  <input className={input} value={l.label} placeholder="Label" onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={input} dir="ltr" value={l.url} placeholder="https://…" onChange={(e) => setLinks((cur) => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                  <button type="button" onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))} className="text-[12px] text-red-600 hover:underline">Remove</button>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
            <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : isNew ? "Create regulation" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
