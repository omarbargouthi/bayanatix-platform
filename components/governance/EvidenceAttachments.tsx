"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The evidence attached to one compliance requirement (db/171): documents and links.
// Each can be previewed or opened, renamed, annotated, replaced and removed.
//
// Preview: the application never allows its own pages inside a frame (X-Frame-Options
// DENY, frame-ancestors 'none' — next.config.mjs, lib/csp.ts), so a document is not
// shown in an iframe. Images are shown with <img>, text files are fetched and shown as
// text, and a PDF opens in a new browser tab in the browser's own viewer.

export type EvidenceItem = {
  evidenceId: number; kind: "FILE" | "LINK"; title: string; note: string | null;
  fileName: string | null; mimeType: string | null; fileSize: number | null; linkUrl: string | null;
  addedBy: string | null; addedAt: string; updatedBy: string | null; updatedAt: string | null; canPreview: boolean;
};

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const isInternal = (url: string) => url.startsWith("/");

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

export function EvidenceAttachments({ fwId, reqId, canEdit, onChange }: {
  fwId: number; reqId: number; canEdit: boolean;
  /** Called with the titles of all items whenever the list changes, so the row can show them. */
  onChange?: (titles: string[]) => void;
}) {
  const base = `/api/governance/compliance/${fwId}/evidence/${reqId}`;
  const [items, setItems] = useState<EvidenceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<null | "FILE" | "LINK">(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", note: "", url: "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EvidenceItem | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Kept in a ref so reporting the list never re-triggers the load below.
  const report = useRef(onChange);
  report.current = onChange;

  const apply = useCallback((next: EvidenceItem[]) => { setItems(next); report.current?.(next.map((i) => i.title)); }, []);
  useEffect(() => {
    let live = true;
    fetch(base).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { if (live) apply(d.items); })
      .catch(() => { if (live) { setItems([]); setError("The evidence could not be loaded."); } });
    return () => { live = false; };
  }, [base, apply]);

  // Images, text and "no preview" open the dialog; a PDF goes to a new tab.
  function showPreview(i: EvidenceItem) {
    const url = `${base}/${i.evidenceId}`;
    if (i.canPreview && i.mimeType === "application/pdf") { window.open(url, "_blank", "noopener,noreferrer"); return; }
    setPreviewText(null); setPreview(i);
    if (i.canPreview && i.mimeType?.startsWith("text/")) {
      fetch(url).then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => setPreviewText(t.length > 300_000 ? t.slice(0, 300_000) + "\n\n… (the rest is not shown; download the document to see all of it)" : t))
        .catch(() => setPreviewText("The document could not be loaded."));
    }
  }

  function open(kind: "FILE" | "LINK") { setAdding(kind); setEditingId(null); setForm({ title: "", note: "", url: "" }); setFile(null); setError(null); }
  function edit(i: EvidenceItem) { setEditingId(i.evidenceId); setAdding(null); setForm({ title: i.title, note: i.note ?? "", url: i.linkUrl ?? "" }); setFile(null); setError(null); }
  function close() { setAdding(null); setEditingId(null); setFile(null); setError(null); }

  async function send(url: string, method: "POST" | "PATCH" | "DELETE", kind: "FILE" | "LINK" | null): Promise<EvidenceItem | null | true> {
    let init: RequestInit = { method };
    if (method !== "DELETE") {
      if (file) {
        const fd = new FormData(); fd.append("file", file); fd.append("title", form.title); fd.append("note", form.note);
        init = { method, body: fd };
      } else {
        init = { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, note: form.note, ...(kind === "LINK" ? { url: form.url } : {}) }) };
      }
    }
    const r = await fetch(url, init);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? "That did not work. Try again."); return null; }
    return method === "DELETE" ? true : d.item;
  }

  async function saveNew() {
    if (!items || !adding) return;
    if (adding === "FILE" && !file) { setError("Choose a document to upload."); return; }
    if (adding === "LINK" && !form.url.trim()) { setError("Enter the link."); return; }
    setBusy(true); setError(null);
    const item = await send(base, "POST", adding);
    setBusy(false);
    if (item && item !== true) { apply([...items, item]); close(); }
  }
  async function saveEdit(i: EvidenceItem) {
    if (!items) return;
    if (!form.title.trim()) { setError("The title cannot be empty."); return; }
    setBusy(true); setError(null);
    const item = await send(`${base}/${i.evidenceId}`, "PATCH", i.kind);
    setBusy(false);
    if (item && item !== true) { apply(items.map((x) => (x.evidenceId === i.evidenceId ? item : x))); close(); }
  }
  async function remove(i: EvidenceItem) {
    if (!items || !confirm(`Remove “${i.title}” from this requirement's evidence?${i.kind === "FILE" ? " The stored document is deleted." : ""}`)) return;
    setBusy(true); setError(null);
    const ok = await send(`${base}/${i.evidenceId}`, "DELETE", null);
    setBusy(false);
    if (ok) apply(items.filter((x) => x.evidenceId !== i.evidenceId));
  }

  const input = "w-full border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink bg-white focus:outline-none focus:border-brand-purple";
  const label = "block text-[10px] font-semibold uppercase tracking-wide text-muted mb-1";
  const link = "text-[11px] text-brand-purple font-medium hover:underline disabled:opacity-40";

  // The fields shared by "add" and "edit"; `kind` decides whether a document or a link is asked for.
  const fields = (kind: "FILE" | "LINK", isEdit: boolean) => (
    <div className="space-y-2.5">
      {kind === "FILE" ? (
        <div>
          <label className={label}>{isEdit ? "Replace the document (optional)" : "Document"}</label>
          <input ref={fileInput} type="file" className="block text-[12px] text-ink-soft file:me-2 file:px-2.5 file:py-1 file:rounded-md file:border file:border-line file:bg-white file:text-[12px] file:text-ink file:cursor-pointer"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !isEdit && !form.title.trim()) setForm((x) => ({ ...x, title: f.name })); }} />
          <div className="text-[10px] text-muted mt-1">Up to 25 MB. Images and text files are previewed here and PDFs in a new tab; other types (Word, Excel…) are downloaded.</div>
        </div>
      ) : (
        <div>
          <label className={label}>Link</label>
          <input className={`${input} font-mono`} dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/catalog/12/tables/34   or   https://intranet.example.com/policy" />
          <div className="text-[10px] text-muted mt-1">A page in Bayanis (copy the part of the address after the site name, starting with /) or any http(s) address such as an intranet page.</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label}>Title</label>
          <input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={kind === "FILE" ? "Defaults to the file name" : "Defaults to the link"} />
        </div>
        <div>
          <label className={label}>Note (optional)</label>
          <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What this shows, which section or page" />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[11px] font-semibold text-ink-soft uppercase tracking-wide">
          Evidence provided{items && items.length > 0 ? ` (${items.length})` : ""}
        </label>
        {canEdit && !adding && (
          <div className="flex items-center gap-3">
            <button onClick={() => open("FILE")} disabled={busy} className={link}>+ Add document</button>
            <button onClick={() => open("LINK")} disabled={busy} className={link}>+ Add link</button>
          </div>
        )}
      </div>

      {error && !adding && editingId == null && <div className="mb-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}

      {items == null ? (
        <div className="text-[12px] text-muted">Loading…</div>
      ) : items.length === 0 && !adding ? (
        <div className="text-[12px] text-muted italic">Nothing attached yet.{canEdit ? " Add a document or a link to a page that shows this requirement is met." : ""}</div>
      ) : (
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
                        <button onClick={() => showPreview(i)} className={link} title={i.mimeType === "application/pdf" ? "Opens in a new tab" : undefined}>Preview</button>
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
          <div className="text-[12px] font-semibold text-ink mb-2">{adding === "FILE" ? "Add a document" : "Add a link"}</div>
          {fields(adding, false)}
          {error && <div className="mt-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">{error}</div>}
          <div className="flex justify-end gap-2 mt-2.5">
            <button onClick={close} disabled={busy} className="btn btn-sm">Cancel</button>
            <button onClick={saveNew} disabled={busy} className="btn btn-primary btn-sm">{busy ? "Saving…" : adding === "FILE" ? "Upload" : "Add link"}</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6 py-6" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl shadow-2xl border border-line w-full max-w-5xl h-full max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line shrink-0">
              <div className="min-w-0">
                <div className="font-bold text-brand-deep truncate">{preview.title}</div>
                <div className="text-[11px] text-muted truncate" dir="ltr">{preview.fileName} · {fmtSize(preview.fileSize)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={`${base}/${preview.evidenceId}?download=1`} className="btn btn-sm">Download</a>
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
              ) : preview.mimeType?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="h-full overflow-auto grid place-items-center p-4"><img src={`${base}/${preview.evidenceId}`} alt={preview.title} className="max-w-full max-h-full" /></div>
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
