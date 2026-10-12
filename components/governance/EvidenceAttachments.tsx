"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Loaded only when such a file is actually previewed: the renderers are large and browser-only.
const previewLoading = () => <div className="h-full grid place-items-center text-sm text-muted">Loading…</div>;
const PdfPreview = dynamic(() => import("./PdfPreview").then((m) => m.PdfPreview), { ssr: false, loading: previewLoading });
const ExcelPreview = dynamic(() => import("./ExcelPreview").then((m) => m.ExcelPreview), { ssr: false, loading: previewLoading });
const OfficePreview = dynamic(() => import("./OfficePreview").then((m) => m.OfficePreview), { ssr: false, loading: previewLoading });

// A list of attached documents and links, used for the evidence of a compliance
// requirement (db/171) and for the attachments of a Governance Framework document
// (db/173). Several documents or links can be added in one go; each can then be
// previewed or opened, renamed, annotated, replaced and removed.
//
// Preview: the application never allows its own pages inside a frame (X-Frame-Options
// DENY, frame-ancestors 'none' — next.config.mjs, lib/csp.ts), so a document is not
// shown in an iframe. Images are shown with <img>, text files are fetched and shown as
// text, a PDF is drawn page by page by pdf.js (PdfPreview), Word and PowerPoint files
// are drawn by OfficePreview, and an Excel workbook is shown as tables by ExcelPreview.

export type EvidenceItem = {
  evidenceId: number; kind: "FILE" | "LINK"; title: string; note: string | null;
  fileName: string | null; mimeType: string | null; fileSize: number | null; linkUrl: string | null;
  addedBy: string | null; addedAt: string; updatedBy: string | null; updatedAt: string | null; canPreview: boolean;
};

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const isInternal = (url: string) => url.startsWith("/");
const linesOf = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function Icon({ kind }: { kind: "FILE" | "LINK" }) {
  return kind === "FILE" ? (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-brand-purple" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-sky-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

/** The evidence of one compliance requirement. */
export function EvidenceAttachments({ fwId, reqId, canEdit, onChange }: {
  fwId: number; reqId: number; canEdit: boolean;
  /** Called with the titles of all items whenever the list changes, so the row can show them. */
  onChange?: (titles: string[]) => void;
}) {
  const report = useRef(onChange);
  report.current = onChange;
  const relay = useCallback((items: EvidenceItem[]) => report.current?.(items.map((i) => i.title)), []);
  return (
    <AttachmentList
      base={`/api/governance/compliance/${fwId}/evidence/${reqId}`} canEdit={canEdit} onChange={relay}
      heading="Evidence provided" removeFrom="this requirement's evidence"
      emptyHint="Add a document or a link to a page that shows this requirement is met."
    />
  );
}

export function AttachmentList({ base, canEdit, onChange, heading, removeFrom, emptyHint }: {
  /** The collection address: GET lists, POST adds; `${base}/${id}` serves, edits and removes one item. */
  base: string; canEdit: boolean;
  /** Called with all items whenever the list changes. */
  onChange?: (items: EvidenceItem[]) => void;
  heading: string;
  /** Completes "Remove “X” from …?" */
  removeFrom: string;
  emptyHint: string;
}) {
  const [items, setItems] = useState<EvidenceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "FILE" | "LINK">(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", note: "", url: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<EvidenceItem | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  // Kept in a ref so reporting the list never re-triggers the load below.
  const report = useRef(onChange);
  report.current = onChange;

  const apply = useCallback((next: EvidenceItem[]) => { setItems(next); report.current?.(next); }, []);
  useEffect(() => {
    let live = true;
    fetch(base).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { if (live) apply(d.items); })
      .catch(() => { if (live) { setItems([]); setError("The list could not be loaded."); } });
    return () => { live = false; };
  }, [base, apply]);

  function showPreview(i: EvidenceItem) {
    const url = `${base}/${i.evidenceId}`;
    setPreviewText(null); setPreview(i);
    if (i.canPreview && i.mimeType?.startsWith("text/")) {
      fetch(url).then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => setPreviewText(t.length > 300_000 ? t.slice(0, 300_000) + "\n\n… (the rest is not shown; download the document to see all of it)" : t))
        .catch(() => setPreviewText("The document could not be loaded."));
    }
  }

  function open(kind: "FILE" | "LINK") { setAdding(kind); setEditingId(null); setForm({ title: "", note: "", url: "" }); setFiles([]); setError(null); }
  function edit(i: EvidenceItem) { setEditingId(i.evidenceId); setAdding(null); setForm({ title: i.title, note: i.note ?? "", url: i.linkUrl ?? "" }); setFiles([]); setError(null); }
  function close() { setAdding(null); setEditingId(null); setFiles([]); setError(null); setProgress(null); }

  /** One request. Returns the saved item, true for a removal, or the error text. */
  async function send(url: string, method: "POST" | "PATCH" | "DELETE", payload?: { file?: File; title: string; note: string; url?: string }): Promise<EvidenceItem | true | string> {
    let init: RequestInit = { method };
    if (payload?.file) {
      const fd = new FormData(); fd.append("file", payload.file); fd.append("title", payload.title); fd.append("note", payload.note);
      init = { method, body: fd };
    } else if (payload) {
      init = { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: payload.title, note: payload.note, ...(payload.url !== undefined ? { url: payload.url } : {}) }) };
    }
    try {
      const r = await fetch(url, init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return (d.error as string | undefined) ?? "That did not work. Try again.";
      return method === "DELETE" ? true : (d.item as EvidenceItem);
    } catch {
      return "The server could not be reached.";
    }
  }

  // Several documents or links are sent one after the other; the ones that fail are
  // reported by name and stay in the form, the rest are added.
  async function saveNew() {
    if (!items || !adding) return;
    const links = linesOf(form.url);
    if (adding === "FILE" && files.length === 0) { setError("Choose one or more documents to upload."); return; }
    if (adding === "LINK" && links.length === 0) { setError("Enter at least one link."); return; }
    const many = (adding === "FILE" ? files.length : links.length) > 1;
    const title = many ? "" : form.title;
    setBusy(true); setError(null);
    const added: EvidenceItem[] = [];
    const failed: { name: string; why: string }[] = [];
    const total = adding === "FILE" ? files.length : links.length;
    for (let n = 0; n < total; n++) {
      if (many) setProgress(`${adding === "FILE" ? "Uploading" : "Adding"} ${n + 1} of ${total}…`);
      const result = adding === "FILE"
        ? await send(base, "POST", { file: files[n], title, note: form.note })
        : await send(base, "POST", { title, note: form.note, url: links[n] });
      if (typeof result === "string") failed.push({ name: adding === "FILE" ? files[n].name : links[n], why: result });
      else if (result !== true) added.push(result);
    }
    setBusy(false); setProgress(null);
    if (added.length > 0) apply([...items, ...added]);
    if (failed.length === 0) { close(); return; }
    if (adding === "FILE") setFiles(files.filter((f) => failed.some((x) => x.name === f.name)));
    else setForm((x) => ({ ...x, url: failed.map((f) => f.name).join("\n") }));
    setError(failed.length === 1 && !many ? failed[0].why : `${failed.length} of ${total} could not be added: ${failed.map((f) => `${f.name} (${f.why})`).join("; ")}`);
  }
  async function saveEdit(i: EvidenceItem) {
    if (!items) return;
    if (!form.title.trim()) { setError("The title cannot be empty."); return; }
    setBusy(true); setError(null);
    const result = await send(`${base}/${i.evidenceId}`, "PATCH", { file: files[0], title: form.title, note: form.note, ...(i.kind === "LINK" ? { url: form.url } : {}) });
    setBusy(false);
    if (typeof result === "string") { setError(result); return; }
    if (result !== true) { apply(items.map((x) => (x.evidenceId === i.evidenceId ? result : x))); close(); }
  }
  async function remove(i: EvidenceItem) {
    if (!items || !confirm(`Remove “${i.title}” from ${removeFrom}?${i.kind === "FILE" ? " The stored document is deleted." : ""}`)) return;
    setBusy(true); setError(null);
    const result = await send(`${base}/${i.evidenceId}`, "DELETE");
    setBusy(false);
    if (typeof result === "string") setError(result);
    else apply(items.filter((x) => x.evidenceId !== i.evidenceId));
  }

  const input = "w-full border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink bg-white focus:outline-none focus:border-brand-purple";
  const label = "block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1";
  const link = "text-[11px] text-brand-purple font-medium hover:underline disabled:opacity-40";
  const filePicker = "block text-[12px] text-ink-soft file:me-2 file:px-2.5 file:py-1 file:rounded-md file:border file:border-line file:bg-white file:text-[12px] file:text-ink file:cursor-pointer";

  // The fields shared by "add" and "edit"; `kind` decides whether documents or links are asked for.
  const fields = (kind: "FILE" | "LINK", isEdit: boolean) => {
    const many = !isEdit && (kind === "FILE" ? files.length : linesOf(form.url).length) > 1;
    return (
      <div className="space-y-2.5">
        {kind === "FILE" ? (
          <div>
            <label className={label}>{isEdit ? "Replace the document (optional)" : "Documents"}</label>
            <input type="file" multiple={!isEdit} className={filePicker}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setFiles(picked);
                if (picked.length === 1 && !isEdit && !form.title.trim()) setForm((x) => ({ ...x, title: picked[0].name }));
              }} />
            {!isEdit && files.length > 1 && (
              <ul className="mt-1.5 text-[11px] text-ink-soft space-y-0.5">
                {files.map((f) => <li key={f.name + f.size} className="break-all" dir="ltr">{f.name} · {fmtSize(f.size)}</li>)}
              </ul>
            )}
            <div className="text-[10px] text-muted mt-1">
              {isEdit ? "Up to 25 MB." : "Choose one or several, up to 25 MB each."} PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), images and text files are previewed here; other types (.doc, .ppt, .xls…) are downloaded.
            </div>
          </div>
        ) : (
          <div>
            <label className={label}>{isEdit ? "Link" : "Links"}</label>
            {isEdit ? (
              <input className={`${input} font-mono`} dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            ) : (
              <textarea className={`${input} font-mono resize-y`} dir="ltr" rows={3} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder={"/catalog/12/tables/34\nhttps://intranet.example.com/policy"} />
            )}
            <div className="text-[10px] text-muted mt-1">{isEdit ? "The" : "One per line: the"} address of a page in Bayanis, or any http(s) address such as an intranet page.</div>
          </div>
        )}
        <div className={many ? "" : "grid grid-cols-2 gap-2.5"}>
          {!many && (
            <div>
              <label className={label}>Title</label>
              <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={kind === "FILE" ? "Defaults to the file name" : "Defaults to the link"} />
            </div>
          )}
          <div>
            <label className={label}>Note (optional){many ? " — applied to all of them" : ""}</label>
            <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What this shows, which section or page" />
          </div>
        </div>
        {many && <div className="text-[10px] text-muted">Each one is titled by its {kind === "FILE" ? "file name" : "address"}; titles can be edited afterwards.</div>}
      </div>
    );
  };

  const previewUrl = preview ? `${base}/${preview.evidenceId}` : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[11px] font-semibold text-ink-soft uppercase tracking-wide">
          {heading}{items && items.length > 0 ? ` (${items.length})` : ""}
        </label>
        {canEdit && !adding && (
          <div className="flex items-center gap-3">
            <button onClick={() => open("FILE")} disabled={busy} className={link}>+ Add documents</button>
            <button onClick={() => open("LINK")} disabled={busy} className={link}>+ Add links</button>
          </div>
        )}
      </div>

      {error && !adding && editingId == null && <div className="mb-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}

      {items == null ? (
        <div className="text-[12px] text-muted">Loading…</div>
      ) : items.length === 0 && !adding ? (
        <div className="text-[12px] text-muted italic">Nothing attached yet.{canEdit ? ` ${emptyHint}` : ""}</div>
      ) : items.length === 0 ? null : (
        <div className="rounded-md border border-line bg-white divide-y divide-line-soft">
          {items.map((i) => (
            <div key={i.evidenceId} className="px-3 py-2">
              {editingId === i.evidenceId ? (
                <div>
                  {fields(i.kind, true)}
                  {error && <div className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}
                  <div className="flex justify-end gap-2 mt-2.5">
                    <button onClick={close} disabled={busy} className="btn btn-sm">Cancel</button>
                    <button onClick={() => saveEdit(i)} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : "Save"}</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <span className="pt-0.5"><Icon kind={i.kind} /></span>
                  <div className="min-w-0 flex-1">
                    {i.kind === "FILE" ? (
                      <button onClick={() => showPreview(i)} className="text-[13px] font-medium text-brand-deep hover:underline text-start break-words">{i.title}</button>
                    ) : (
                      <a href={i.linkUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-brand-deep hover:underline break-words">{i.title}</a>
                    )}
                    <div className="text-[11px] text-muted break-all" dir="ltr">
                      {i.kind === "FILE"
                        ? <>{i.fileName !== i.title && <>{i.fileName} · </>}{fmtSize(i.fileSize)}</>
                        : <>{isInternal(i.linkUrl ?? "") ? "Bayanis page" : "External link"} · {i.linkUrl}</>}
                    </div>
                    {i.note && <div className="text-[12px] text-ink-soft mt-0.5">{i.note}</div>}
                    <div className="text-[10px] text-muted mt-0.5">
                      Added{i.addedBy ? ` by ${i.addedBy}` : ""} on {i.addedAt.slice(0, 10)}{i.updatedAt ? ` · edited ${i.updatedAt.slice(0, 10)}${i.updatedBy ? ` by ${i.updatedBy}` : ""}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 pt-0.5">
                    {i.kind === "FILE" ? (
                      <>
                        <button onClick={() => showPreview(i)} className={link}>Preview</button>
                        <a href={`${base}/${i.evidenceId}?download=1`} className={link}>Download</a>
                      </>
                    ) : (
                      <a href={i.linkUrl ?? "#"} target="_blank" rel="noopener noreferrer" className={link}>Open</a>
                    )}
                    {canEdit && <button onClick={() => edit(i)} disabled={busy} className={link}>Edit</button>}
                    {canEdit && <button onClick={() => remove(i)} disabled={busy} className="text-[11px] text-red-600 font-medium hover:underline disabled:opacity-40">Remove</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-2 rounded-lg border border-brand-purple/30 bg-brand-purple/[0.03] px-3.5 py-3">
          <div className="text-[12px] font-semibold text-ink mb-2">{adding === "FILE" ? "Add documents" : "Add links"}</div>
          {fields(adding, false)}
          {error && <div className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}
          <div className="flex justify-end items-center gap-2 mt-2.5">
            {progress && <span className="text-[11px] text-muted me-auto">{progress}</span>}
            <button onClick={close} disabled={busy} className="btn btn-sm">Cancel</button>
            <button onClick={saveNew} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Saving…" : adding === "FILE" ? (files.length > 1 ? `Upload ${files.length} documents` : "Upload") : (linesOf(form.url).length > 1 ? `Add ${linesOf(form.url).length} links` : "Add link")}
            </button>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6 py-6" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl shadow-2xl border border-line w-full max-w-5xl h-full max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line shrink-0">
              <div className="min-w-0">
                <div className="font-bold text-brand-deep truncate">{preview.title}</div>
                <div className="text-[11px] text-muted truncate" dir="ltr">{preview.fileName} · {fmtSize(preview.fileSize)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {preview.mimeType === "application/pdf" && (
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-brand-purple font-medium hover:underline">Open in a new tab</a>
                )}
                <a href={`${previewUrl}?download=1`} className="btn btn-sm">Download</a>
                <button onClick={() => setPreview(null)} aria-label="Close" className="text-muted hover:text-ink text-xl leading-none">&times;</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-canvas-soft">
              {!preview.canPreview ? (
                <div className="h-full grid place-items-center text-center px-6">
                  <div>
                    <div className="text-sm text-ink">This type of document cannot be shown in the browser.</div>
                    <div className="text-[12px] text-muted mt-1">Download it to open it in its own application.</div>
                  </div>
                </div>
              ) : preview.mimeType === "application/pdf" ? (
                <PdfPreview url={previewUrl} />
              ) : preview.mimeType === DOCX_TYPE ? (
                <OfficePreview url={previewUrl} kind="docx" />
              ) : preview.mimeType === PPTX_TYPE ? (
                <OfficePreview url={previewUrl} kind="pptx" />
              ) : preview.mimeType === XLSX_TYPE ? (
                <ExcelPreview url={previewUrl} />
              ) : preview.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="h-full overflow-auto grid place-items-center p-4"><img src={previewUrl} alt={preview.title} className="max-w-full max-h-full" /></div>
              ) : (
                <pre className="h-full overflow-auto bg-white p-4 text-[12px] font-mono text-ink whitespace-pre-wrap break-words" dir="auto">{previewText ?? "Loading…"}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
