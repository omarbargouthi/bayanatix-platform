"use client";

import { useState } from "react";

// A regulation's registration details (db/162): where it applies, who issues or
// enforces it, since when, and where the official text is. Shown under the regulation's
// name on the Compliance page; people who manage the Governance domain can edit it.

export type RegulationLink = { label: string; url: string };
export type RegulationDetailsData = {
  frameworkId: number;
  regionName: string | null;
  countriesInScope: string | null;
  scopeNote: string | null;
  regulatoryBody: string | null;
  effectiveDate: string | null;
  effectiveDateNote: string | null;
  officialUrl: string | null;
  referenceLinks: RegulationLink[];
};

const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

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
  const d = details;
  const empty = !d.regionName && !d.countriesInScope && !d.regulatoryBody && !d.effectiveDate && !d.effectiveDateNote && !d.officialUrl && !d.scopeNote && d.referenceLinks.length === 0;

  const summary = [d.regulatoryBody, d.countriesInScope ?? d.regionName, d.effectiveDate ? `In force ${fmtDate(d.effectiveDate)}` : null].filter(Boolean) as string[];

  return (
    <div className="mt-2 text-[12px]">
      <div className="flex items-center gap-2 flex-wrap text-ink-soft">
        {summary.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <span className="text-muted">·</span>}<span dir="auto">{s}</span>
          </span>
        ))}
        {empty && <span className="text-muted">No regulation details registered yet.</span>}
        {!empty && <button onClick={() => setOpen((v) => !v)} className="text-brand-purple font-medium hover:underline">{open ? "Hide details" : "Regulation details"}</button>}
        {canEdit && <button onClick={() => setEditing(true)} className="text-brand-purple font-medium hover:underline">{empty ? "Add details" : "Edit"}</button>}
      </div>

      {open && !empty && (
        <dl className="mt-3 grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 max-w-3xl rounded-lg border border-line bg-white px-4 py-3">
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

      {editing && <EditModal details={d} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setOpen(true); onSaved(); }} />}
    </div>
  );
}

function EditModal({ details, onClose, onSaved }: { details: RegulationDetailsData; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    regionName: details.regionName ?? "", countriesInScope: details.countriesInScope ?? "", scopeNote: details.scopeNote ?? "",
    regulatoryBody: details.regulatoryBody ?? "", effectiveDate: details.effectiveDate?.slice(0, 10) ?? "",
    effectiveDateNote: details.effectiveDateNote ?? "", officialUrl: details.officialUrl ?? "",
  });
  const [links, setLinks] = useState<RegulationLink[]>(details.referenceLinks.length ? details.referenceLinks : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));

  async function save() {
    const cleanLinks = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url);
    if (f.officialUrl.trim() && !isHttpUrl(f.officialUrl)) { setError("The official link must start with http:// or https://"); return; }
    if (cleanLinks.some((l) => !isHttpUrl(l.url))) { setError("Every reference link must start with http:// or https://"); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/governance/compliance/${details.frameworkId}/details`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, referenceLinks: cleanLinks }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error ?? "The details could not be saved."); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  const input = "w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple";
  const label = "block text-[11px] uppercase tracking-wider text-muted mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-[640px] border border-line">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-bold text-brand-deep">Regulation details</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
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
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
