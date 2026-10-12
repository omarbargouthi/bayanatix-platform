"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Shows a PDF inside the page by drawing its pages on canvases with pdf.js.
//
// Why not an <iframe> or <embed>: the application never allows its own pages in a frame
// and allows no plug-ins (X-Frame-Options DENY, frame-ancestors 'none', object-src
// 'none' — next.config.mjs, lib/csp.ts). pdf.js needs neither: the document is fetched
// as bytes and rendered by script. Its worker is served from this origin
// (public/pdfjs/, copied from node_modules by scripts/copy-pdf-worker.mjs), which the
// policy's worker-src 'self' allows.

const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
// Long documents are drawn up to this page; the rest is a download away.
const MAX_PAGES = 60;
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
};

export function PdfPreview({ url }: { url: string }) {
  const a = useLang().t.attachments;
  const pageLabel = useRef(a.pageN);
  pageLabel.current = a.pageN;
  const holder = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Load the document once per address.
  useEffect(() => {
    let live = true;
    let loaded: PdfDoc | null = null;
    setDoc(null); setError(false);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch");
        const data = new Uint8Array(await res.arrayBuffer());
        // isEvalSupported false: never build functions from document content (also what the CSP requires).
        loaded = (await pdfjs.getDocument({ data, isEvalSupported: false }).promise) as unknown as PdfDoc;
        if (live) setDoc(loaded); else void loaded.destroy();
      } catch {
        if (live) setError(true);
      }
    })();
    return () => { live = false; void loaded?.destroy(); };
  }, [url]);

  // Draw the pages, again whenever the zoom changes.
  useEffect(() => {
    const el = holder.current;
    if (!doc || !el) return;
    let live = true;
    const tasks: { cancel: () => void }[] = [];
    el.replaceChildren();
    (async () => {
      const pages = Math.min(doc.numPages, MAX_PAGES);
      // Sharper on high-density screens without drawing enormous canvases.
      const density = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= pages && live; n++) {
        const page = await doc.getPage(n);
        if (!live) return;
        // "100%" fits the page to the width of the dialog.
        const base = page.getViewport({ scale: 1 });
        const fit = Math.max(0.2, (el.clientWidth - 32) / base.width);
        const viewport = page.getViewport({ scale: fit * zoom * density });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / density)}px`;
        canvas.style.height = `${Math.floor(viewport.height / density)}px`;
        canvas.className = "block mx-auto my-3 bg-white shadow border border-line";
        // pdf.js places each glyph itself; a canvas that inherits right-to-left (Arabic UI) misplaces them.
        canvas.dir = "ltr";
        canvas.setAttribute("aria-label", pageLabel.current.replace("{n}", String(n)));
        el.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        const task = page.render({ canvasContext: ctx, viewport });
        tasks.push(task);
        await task.promise.catch(() => {});
      }
    })();
    return () => { live = false; tasks.forEach((t) => t.cancel()); };
  }, [doc, zoom]);

  const step = (dir: -1 | 1) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + dir))]);

  if (error) return <div className="h-full grid place-items-center text-center px-6 text-sm text-ink">{a.pdfFailed}</div>;
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-line bg-white text-[12px] text-ink-soft shrink-0">
        <span>
          {doc ? (doc.numPages === 1 ? a.pdfPageOne : a.pdfPages.replace("{n}", String(doc.numPages))) : a.loading}
          {doc && doc.numPages > MAX_PAGES && <span className="text-amber-700">{a.pdfFirstN.replace("{n}", String(MAX_PAGES))}</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <button onClick={() => step(-1)} disabled={!doc || zoom === ZOOMS[0]} aria-label={a.zoomOut} className="w-6 h-6 grid place-items-center rounded border border-line hover:border-brand-purple disabled:opacity-40">−</button>
          <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => step(1)} disabled={!doc || zoom === ZOOMS[ZOOMS.length - 1]} aria-label={a.zoomIn} className="w-6 h-6 grid place-items-center rounded border border-line hover:border-brand-purple disabled:opacity-40">+</button>
        </span>
      </div>
      <div ref={holder} dir="ltr" className="flex-1 min-h-0 overflow-auto px-4" />
    </div>
  );
}
