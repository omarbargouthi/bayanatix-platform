"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { GovDoc } from "@/lib/queries/gov-framework";
import { RegulationForm, type RegulationDetailsData } from "./RegulationDetails";
import { AttachmentList } from "./EvidenceAttachments";
import { FormDialog, FormField } from "@/components/ui/FormDialog";
import { RoadmapExecution, ExecutionBadge, type ExecutionCounts } from "./RoadmapExecution";
import { fwSectionKey } from "@/lib/gov-framework-sections";
import { useLang } from "@/lib/lang-context";

type Props = {
  sectionCode:  string;
  initialDocs:  GovDoc[];
  userId:       string;
  /** The viewer manages Data Governance: may add, edit and delete. */
  canManage:    boolean;
  /** Shown between the page heading and the documents (the Communication Plan's schedule). */
  top?:         ReactNode;
  /** A heading for the documents table, when something is shown above it. */
  docsHeading?: string;
};

type DocForm = {
  title: string; description: string; statusCode: string;
  versionText: string; effectiveDate: string; expiryDate: string; ownerUserId: string; sourceUrl: string; announce: boolean; domain: string;
};

const EMPTY_FORM: DocForm = {
  title: "", description: "", statusCode: "DRAFT",
  versionText: "", effectiveDate: "", expiryDate: "", ownerUserId: "", sourceUrl: "", announce: false, domain: "",
};

export function FrameworkSectionClient({ sectionCode, initialDocs, canManage, top, docsHeading }: Props) {
  const { t } = useLang();
  const g  = t.governance;
  const fw = g.fw;
  const a  = t.attachments;

  const sectionKey = fwSectionKey(sectionCode);
  const sectionLabel = g.sectionLabels[sectionKey] ?? sectionCode;
  const sectionDescription = g.sectionDescs[sectionKey] ?? "";

  const STATUS_LABEL: Record<string, string> = {
    DRAFT: fw.statusDraft, REVIEW: fw.statusReview,
    APPROVED: fw.statusApproved, ARCHIVED: fw.statusArchived,
  };
  const STATUS_STYLES: Record<string, string> = {
    DRAFT:    "bg-gray-100 text-gray-600",
    REVIEW:   "bg-amber-100 text-amber-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    ARCHIVED: "bg-red-100 text-red-600",
  };

  const [docs, setDocs]               = useState<GovDoc[]>(initialDocs);
  const [showModal, setShowModal]     = useState(false);
  const [editDoc, setEditDoc]         = useState<GovDoc | null>(null);
  const [form, setForm]               = useState<DocForm>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [expandedId, setExpandedId]   = useState<number | null>(null);
  const [error, setError]             = useState("");
  // Files and links chosen in the "add document" dialog; they are attached once the
  // document itself has been created.
  const [newFiles, setNewFiles]       = useState<File[]>([]);
  const [newLinks, setNewLinks]       = useState("");
  const [saveStep, setSaveStep]       = useState("");

  // The Regulatory section is the registry of regulations: its entries are added and
  // edited with the same full form as on the Compliance page. (Status, owner and expiry —
  // the document side of an entry — keep the plain document dialog, under "Document".)
  const isRegistry = sectionCode === "REGULATORY";
  // A roadmap is for a domain and has an execution side: milestones and deliverables.
  const isRoadmap = sectionCode === "ROADMAP";
  const setExecution = (docId: number, c: ExecutionCounts) =>
    setDocs((p) => p.map((d) => (d.docId === docId ? { ...d, execTotal: c.total, execCompleted: c.completed, execStarted: c.started, execLate: c.late } : d)));
  const [regulationForm, setRegulationForm] = useState<{ details?: RegulationDetailsData } | null>(null);

  async function reloadDocs() {
    const r = await fetch(`/api/governance/framework?section=${sectionCode}`);
    if (r.ok) setDocs((await r.json()).docs);
  }
  async function openRegulation(frameworkId: number) {
    const r = await fetch("/api/governance/compliance");
    const list: RegulationDetailsData[] = r.ok ? await r.json() : [];
    const details = (Array.isArray(list) ? list : []).find((f) => f.frameworkId === frameworkId);
    if (details) setRegulationForm({ details }); else alert("This regulation could not be loaded.");
  }

  function openNew() {
    if (isRegistry) { setRegulationForm({}); return; }
    setForm(EMPTY_FORM); setEditDoc(null); setShowModal(true); setError(""); setNewFiles([]); setNewLinks("");
  }
  function openEdit(doc: GovDoc) {
    setForm({
      title: doc.title, description: doc.description ?? "",
      statusCode: doc.statusCode, versionText: doc.versionText ?? "",
      effectiveDate: doc.effectiveDate?.slice(0, 10) ?? "",
      expiryDate: doc.expiryDate?.slice(0, 10) ?? "",
      ownerUserId: doc.ownerUserId ?? "",
      sourceUrl: doc.sourceUrl ?? "",
      announce: doc.announce,
      domain: doc.domain ?? "",
    });
    setEditDoc(doc); setShowModal(true); setError("");
  }

  const setAttachmentCount = (docId: number, count: number) =>
    setDocs((p) => p.map((d) => (d.docId === docId && d.attachmentCount !== count ? { ...d, attachmentCount: count } : d)));

  async function save() {
    if (!form.title.trim()) { setError(fw.titleRequired); return; }
    setSaving(true); setError("");
    try {
      const body = {
        sectionCode,
        title: form.title, description: form.description || null,
        statusCode: form.statusCode, versionText: form.versionText || null,
        effectiveDate: form.effectiveDate || null, expiryDate: form.expiryDate || null,
        ownerUserId: form.ownerUserId || null, sourceUrl: form.sourceUrl || null,
        announce: form.announce,
        ...(isRoadmap ? { domain: form.domain.trim() || null } : {}),
      };
      const failed: string[] = [];
      if (editDoc) {
        const r = await fetch(`/api/governance/framework/${editDoc.docId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? a.docSaveFailed); return; }
      } else {
        const r = await fetch("/api/governance/framework", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const created = await r.json().catch(() => ({}));
        if (!r.ok || !created.docId) { setError(created.error ?? a.docSaveFailed); return; }
        // The document exists now; attach what was chosen, one item after the other.
        const base = `/api/governance/framework/${created.docId}/attachments`;
        const links = newLinks.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const total = newFiles.length + links.length;
        let n = 0;
        for (const file of newFiles) {
          setSaveStep(a.attachingN.replace("{n}", String(++n)).replace("{total}", String(total)));
          const fd = new FormData(); fd.append("file", file);
          const up = await fetch(base, { method: "POST", body: fd }).catch(() => null);
          if (!up?.ok) failed.push(`${file.name} (${(await up?.json().catch(() => ({})))?.error ?? a.notUploaded})`);
        }
        for (const url of links) {
          setSaveStep(a.attachingN.replace("{n}", String(++n)).replace("{total}", String(total)));
          const up = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => null);
          if (!up?.ok) failed.push(`${url} (${(await up?.json().catch(() => ({})))?.error ?? a.notAdded})`);
        }
      }
      await reloadDocs();
      setShowModal(false);
      if (failed.length > 0) alert(a.attachFailed.replace("{n}", String(failed.length)).replace("{list}", failed.join("\n")));
    } finally { setSaving(false); setSaveStep(""); }
  }

  async function deleteDoc(docId: number) {
    if (!confirm(t.common.delete + "?")) return;
    const r = await fetch(`/api/governance/framework/${docId}`, { method: "DELETE" });
    if (!r.ok) { const b = await r.json().catch(() => ({})); alert(b.error ?? "Could not delete."); return; }
    setDocs((p) => p.filter((d) => d.docId !== docId));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{sectionLabel}</h1>
          <p className="text-sm text-ink-soft mt-0.5">{sectionDescription}</p>
        </div>
        {canManage && <button onClick={openNew} className="btn btn-primary">{isRegistry ? "+ New Regulation" : fw.addDocument}</button>}
      </div>

      {top}
      {docsHeading && <h2 className="font-bold text-brand-deep mt-7">{docsHeading}</h2>}

      <div className={`card overflow-hidden ${docsHeading ? "mt-3" : "mt-5"}`}>
        {docs.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-ink-soft text-sm">{fw.noDocuments}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas-soft border-b border-line text-left">
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colTitle}</th>
                {isRegistry && <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">Countries in scope</th>}
                {isRoadmap && <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colDomain}</th>}
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colStatus}</th>
                {isRoadmap && <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colExecution}</th>}
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colVersion}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colEffective}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colOwner}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colFiles}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <Fragment key={doc.docId}>
                  <tr key={doc.docId} className="border-b border-line-soft hover:bg-canvas transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setExpandedId(expandedId === doc.docId ? null : doc.docId)}
                          className="font-semibold text-ink hover:text-brand-purple text-left">
                          {doc.title}
                        </button>
                        {doc.sourceUrl && (
                          <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" title={doc.sourceUrl}
                            onClick={(e) => e.stopPropagation()} className="text-muted hover:text-brand-purple shrink-0">
                            🔗
                          </a>
                        )}
                      </div>
                      {doc.frameworkId != null && (
                        <div className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {[doc.regulatoryBody].filter(Boolean).map((x, i) => (
                            <span key={i} dir="auto">{i > 0 ? "· " : ""}{x}</span>
                          ))}
                          <span>{doc.regulatoryBody ? "· " : ""}{doc.requirementCount ?? 0} requirement{doc.requirementCount === 1 ? "" : "s"}</span>
                          <a href={`/governance/compliance?fw=${doc.frameworkId}`} className="text-brand-purple hover:underline">· Open in Compliance</a>
                        </div>
                      )}
                    </td>
                    {isRegistry && (
                      <td className="px-4 py-3 text-ink-soft text-[13px] max-w-[200px]" dir="auto">
                        {doc.countriesInScope ?? "—"}
                        {doc.regionName && <div className="text-[11px] text-muted">{doc.regionName}</div>}
                      </td>
                    )}
                    {isRoadmap && <td className="px-4 py-3 text-ink-soft text-[13px]" dir="auto">{doc.domain ?? "—"}</td>}
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[doc.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[doc.statusCode] ?? doc.statusCode}
                      </span>
                    </td>
                    {isRoadmap && (
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandedId(expandedId === doc.docId ? null : doc.docId)} className="text-start">
                          <ExecutionBadge compact counts={{ total: doc.execTotal, completed: doc.execCompleted, started: doc.execStarted, late: doc.execLate }} />
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted">{doc.versionText ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{doc.effectiveDate?.slice(0, 10) ?? "—"}</td>
                    <td className="px-4 py-3 text-muted truncate max-w-[140px]">{doc.ownerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandedId(expandedId === doc.docId ? null : doc.docId)}
                        className="text-brand-purple hover:underline text-[12px]" title={a.showFilesTooltip}>
                        {doc.attachmentCount} {fw.colFiles.toLowerCase()}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && <div className="flex items-center gap-2 justify-end">
                        {isRegistry && doc.frameworkId != null ? (
                          <>
                            <button onClick={() => openRegulation(doc.frameworkId!)} className="text-[11px] text-ink-soft hover:text-brand-purple">{t.common.edit}</button>
                            <button onClick={() => openEdit(doc)} className="text-[11px] text-ink-soft hover:text-brand-purple" title="Status, owner and expiry of the registry entry">Document</button>
                          </>
                        ) : (
                          <button onClick={() => openEdit(doc)} className="text-[11px] text-ink-soft hover:text-brand-purple">{t.common.edit}</button>
                        )}
                        <button onClick={() => deleteDoc(doc.docId)} className="text-[11px] text-ink-soft hover:text-red-500">{t.common.delete}</button>
                      </div>}
                    </td>
                  </tr>
                  {expandedId === doc.docId && (
                    <tr key={`${doc.docId}-exp`} className="bg-canvas-soft border-b border-line-soft">
                      <td colSpan={isRegistry ? 8 : isRoadmap ? 9 : 7} className="px-6 py-3 text-sm text-ink-soft space-y-2.5">
                        {doc.description && <p>{doc.description}</p>}
                        {doc.sourceUrl && (
                          <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-brand-purple hover:underline text-[12px] break-all inline-block">
                            🔗 {doc.sourceUrl}
                          </a>
                        )}
                        {isRoadmap && <RoadmapExecution docId={doc.docId} canManage={canManage} onChange={(c) => setExecution(doc.docId, c)} />}
                        <AttachmentList
                          base={`/api/governance/framework/${doc.docId}/attachments`} canEdit={canManage}
                          heading={a.filesAndLinks} removeFrom={a.docRemoveFrom}
                          emptyHint={a.docEmptyHint}
                          onChange={(items) => setAttachmentCount(doc.docId, items.length)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {regulationForm && (
        <RegulationForm details={regulationForm.details} onClose={() => setRegulationForm(null)}
          onSaved={() => { setRegulationForm(null); reloadDocs(); }} />
      )}

      {showModal && (
        <FormDialog
          title={editDoc ? fw.editDocument : fw.addDocument.replace(/^\+\s*/, "")} subtitle={sectionLabel}
          onClose={() => setShowModal(false)}
          footer={<>
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? (saveStep || t.common.saving) : t.common.save}</button>
          </>}
        >
              <Field label={fw.formTitle}>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="field" />
              </Field>
              {isRoadmap && (
                <Field label={fw.formDomain} hint={fw.domainHint}>
                  <input value={form.domain} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} className="field" list="roadmap-domains" />
                  <datalist id="roadmap-domains">
                    {fw.domainOptions.split(/[,،]/).map((d) => d.trim()).filter(Boolean).map((d) => <option key={d} value={d} />)}
                  </datalist>
                </Field>
              )}
              <Field label={fw.formDesc}>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="field" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={fw.formStatus}>
                  <select value={form.statusCode} onChange={(e) => setForm((p) => ({ ...p, statusCode: e.target.value }))} className="field">
                    <option value="DRAFT">{fw.statusDraft}</option>
                    <option value="REVIEW">{fw.statusReview}</option>
                    <option value="APPROVED">{fw.statusApproved}</option>
                    <option value="ARCHIVED">{fw.statusArchived}</option>
                  </select>
                </Field>
                <Field label={fw.formVersion}>
                  <input value={form.versionText} onChange={(e) => setForm((p) => ({ ...p, versionText: e.target.value }))} className="field" placeholder="e.g. v1.2" />
                </Field>
                <Field label={fw.formEffective}>
                  <input type="date" value={form.effectiveDate} onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))} className="field" />
                </Field>
                <Field label={fw.formExpiry}>
                  <input type="date" value={form.expiryDate} onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))} className="field" />
                </Field>
              </div>
              <Field label={fw.formOwner}>
                <input value={form.ownerUserId} onChange={(e) => setForm((p) => ({ ...p, ownerUserId: e.target.value }))} className="field" placeholder="e.g. john.smith" />
              </Field>
              <Field label={fw.formSourceUrl}>
                <input type="url" value={form.sourceUrl} onChange={(e) => setForm((p) => ({ ...p, sourceUrl: e.target.value }))} className="field" placeholder="https://..." />
              </Field>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="accent-brand-purple w-4 h-4 mt-0.5" checked={form.announce} onChange={(e) => setForm((p) => ({ ...p, announce: e.target.checked }))} />
                <span>
                  <span className="block text-sm text-ink">{t.announcements.pinLabel}</span>
                  <span className="block text-[11px] text-muted">{t.announcements.pinHint}</span>
                </span>
              </label>

              {/* Files and links: live on a saved document, chosen up front on a new one. */}
              <div className="border-t border-line-soft pt-4">
                {editDoc ? (
                  <AttachmentList
                    base={`/api/governance/framework/${editDoc.docId}/attachments`} canEdit
                    heading={a.filesAndLinks} removeFrom={a.docRemoveFrom}
                    emptyHint={a.docEmptyHint}
                    onChange={(items) => setAttachmentCount(editDoc.docId, items.length)}
                  />
                ) : (
                  <div className="space-y-4">
                    <Field label={a.filesLabel}>
                      <input type="file" multiple onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
                        className="block text-[12px] text-ink-soft file:me-2 file:px-2.5 file:py-1 file:rounded-md file:border file:border-line file:bg-white file:text-[12px] file:text-ink file:cursor-pointer" />
                      {newFiles.length > 1 && (
                        <ul className="mt-1.5 text-[11px] text-ink-soft space-y-0.5">
                          {newFiles.map((f) => <li key={f.name + f.size} className="break-all" dir="ltr">{f.name}</li>)}
                        </ul>
                      )}
                      <div className="text-[10px] text-muted mt-1">{a.newFilesHint}</div>
                    </Field>
                    <Field label={a.linksLabel}>
                      <textarea value={newLinks} onChange={(e) => setNewLinks(e.target.value)} rows={2} dir="ltr" className="field font-mono text-[12px]"
                        placeholder={"/catalog/12/tables/34\nhttps://intranet.example.com/policy"} />
                      <div className="text-[10px] text-muted mt-1">{a.newLinksHint}</div>
                    </Field>
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        </FormDialog>
      )}
    </div>
  );
}

const Field = FormField;
