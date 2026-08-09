"use client";

import { useState } from "react";
import type { GovDoc } from "@/lib/queries/gov-framework";
import { useLang } from "@/lib/lang-context";

type Props = {
  sectionCode:  string;
  initialDocs:  GovDoc[];
  userId:       string;
};

type DocForm = {
  title: string; description: string; statusCode: string;
  versionText: string; effectiveDate: string; expiryDate: string; ownerUserId: string; sourceUrl: string;
};

const EMPTY_FORM: DocForm = {
  title: "", description: "", statusCode: "DRAFT",
  versionText: "", effectiveDate: "", expiryDate: "", ownerUserId: "", sourceUrl: "",
};

type SectionKey = "policy" | "process" | "strategy" | "roadmap" | "standard" | "training" | "regulatory";

export function FrameworkSectionClient({ sectionCode, initialDocs }: Props) {
  const { t } = useLang();
  const g  = t.governance;
  const fw = g.fw;

  const sectionKey = sectionCode.toLowerCase() as SectionKey;
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
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [error, setError]             = useState("");

  function openNew() { setForm(EMPTY_FORM); setEditDoc(null); setShowModal(true); setError(""); }
  function openEdit(doc: GovDoc) {
    setForm({
      title: doc.title, description: doc.description ?? "",
      statusCode: doc.statusCode, versionText: doc.versionText ?? "",
      effectiveDate: doc.effectiveDate?.slice(0, 10) ?? "",
      expiryDate: doc.expiryDate?.slice(0, 10) ?? "",
      ownerUserId: doc.ownerUserId ?? "",
      sourceUrl: doc.sourceUrl ?? "",
    });
    setEditDoc(doc); setShowModal(true); setError("");
  }

  async function save() {
    if (!form.title.trim()) { setError(fw.titleRequired); return; }
    setSaving(true);
    try {
      const body = {
        sectionCode,
        title: form.title, description: form.description || null,
        statusCode: form.statusCode, versionText: form.versionText || null,
        effectiveDate: form.effectiveDate || null, expiryDate: form.expiryDate || null,
        ownerUserId: form.ownerUserId || null, sourceUrl: form.sourceUrl || null,
      };
      if (editDoc) {
        await fetch(`/api/governance/framework/${editDoc.docId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/governance/framework", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      const res = await fetch(`/api/governance/framework?section=${sectionCode}`);
      setDocs((await res.json()).docs);
      setShowModal(false);
    } finally { setSaving(false); }
  }

  async function deleteDoc(docId: number) {
    if (!confirm(t.common.delete + "?")) return;
    await fetch(`/api/governance/framework/${docId}`, { method: "DELETE" });
    setDocs((p) => p.filter((d) => d.docId !== docId));
  }

  async function uploadFile(docId: number, file: File) {
    setUploadingId(docId);
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/governance/framework/${docId}/attachments`, { method: "POST", body: fd });
    const res = await fetch(`/api/governance/framework?section=${sectionCode}`);
    setDocs((await res.json()).docs);
    setUploadingId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{sectionLabel}</h1>
          <p className="text-sm text-ink-soft mt-0.5">{sectionDescription}</p>
        </div>
        <button onClick={openNew} className="btn btn-primary">{fw.addDocument}</button>
      </div>

      <div className="card overflow-hidden mt-5">
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
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colStatus}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colVersion}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colEffective}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colOwner}</th>
                <th className="px-4 py-3 font-semibold text-ink-soft text-xs uppercase tracking-wide">{fw.colFiles}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <>
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
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[doc.statusCode] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[doc.statusCode] ?? doc.statusCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{doc.versionText ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{doc.effectiveDate?.slice(0, 10) ?? "—"}</td>
                    <td className="px-4 py-3 text-muted truncate max-w-[140px]">{doc.ownerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <label className="cursor-pointer text-brand-purple hover:underline text-[12px] relative">
                        {uploadingId === doc.docId ? fw.uploading : `${doc.attachmentCount} ${fw.colFiles.toLowerCase()}`}
                        <input type="file" className="absolute inset-0 opacity-0 w-full cursor-pointer"
                          onChange={(e) => e.target.files?.[0] && uploadFile(doc.docId, e.target.files[0])} />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openEdit(doc)} className="text-[11px] text-ink-soft hover:text-brand-purple">{t.common.edit}</button>
                        <button onClick={() => deleteDoc(doc.docId)} className="text-[11px] text-ink-soft hover:text-red-500">{t.common.delete}</button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === doc.docId && (doc.description || doc.sourceUrl) && (
                    <tr key={`${doc.docId}-exp`} className="bg-canvas-soft border-b border-line-soft">
                      <td colSpan={7} className="px-6 py-3 text-sm text-ink-soft space-y-1.5">
                        {doc.description && <p>{doc.description}</p>}
                        {doc.sourceUrl && (
                          <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-brand-purple hover:underline text-[12px] break-all inline-block">
                            🔗 {doc.sourceUrl}
                          </a>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">
              {editDoc ? fw.editDocument : `${fw.addDocument} — ${sectionLabel}`}
            </h2>
            {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
            <div className="space-y-3">
              <Field label={fw.formTitle}>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="field" />
              </Field>
              <Field label={fw.formDesc}>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="field" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn btn-sm">{t.common.cancel}</button>
              <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">{saving ? t.common.saving : t.common.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-ink-soft mb-1">{label}</label>
      {children}
    </div>
  );
}
