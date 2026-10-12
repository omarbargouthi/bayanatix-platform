"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";

// Shows a Word (.docx) or PowerPoint (.pptx) file inside the page.
//
// Like PdfPreview, nothing is framed and no plug-in is used: the file is fetched as bytes
// and drawn as ordinary page elements by script — docx-preview for Word, pptx-preview for
// PowerPoint. Both are loaded only when such a file is actually previewed.
//
// The file's content is not trusted. docx-preview builds elements and sets text, never
// markup. pptx-preview writes slide text as markup; ordinary slide text is still safe,
// because it reaches it with its XML escaping intact, but a CDATA section would arrive
// raw — so CDATA sections are rewritten as escaped text before it sees the file
// (escapeCdata; same document, no raw markup). Links in either kind of file are kept
// only when they are ordinary web or mail addresses, and open in a new tab.
//
// The layout is an approximation, not the application's own rendering: fonts the browser
// does not have are substituted and some effects are not drawn. The download is the
// faithful copy. The older binary formats (.doc, .ppt) are not supported.

const SLIDE_WIDTH = 960;

async function escapeCdata(data: ArrayBuffer): Promise<ArrayBuffer> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const parts = Object.keys(zip.files).filter((n) => n.startsWith("ppt/") && n.endsWith(".xml"));
  let changed = false;
  for (const name of parts) {
    const xml = await zip.files[name].async("string");
    if (!xml.includes("<![CDATA[")) continue;
    zip.file(name, xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")));
    changed = true;
  }
  return changed ? zip.generateAsync({ type: "arraybuffer" }) : data;
}

function tameLinks(root: HTMLElement) {
  root.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); }
    else a.removeAttribute("href");
  });
}

export function OfficePreview({ url, kind }: { url: string; kind: "docx" | "pptx" }) {
  const a = useLang().t.attachments;
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let live = true;
    let destroy: (() => void) | null = null;
    setState("loading");
    el.replaceChildren();
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch");
        const data = await res.arrayBuffer();
        if (!live) return;
        if (kind === "docx") {
          const { renderAsync } = await import("docx-preview");
          await renderAsync(data, el, undefined, { className: "docx", inWrapper: true, ignoreLastRenderedPageBreak: false, useBase64URL: true, renderAltChunks: false });
        } else {
          const safe = await escapeCdata(data);
          const { init } = await import("pptx-preview");
          const width = Math.min(SLIDE_WIDTH, Math.max(320, el.clientWidth - 32));
          const previewer = init(el, { width, height: Math.round((width * 9) / 16), mode: "list" });
          destroy = () => previewer.destroy();
          await previewer.preview(safe);
        }
        if (!live) return;
        tameLinks(el);
        setState("ready");
      } catch {
        if (live) setState("error");
      }
    })();
    return () => { live = false; try { destroy?.(); } catch { /* already gone */ } };
  }, [url, kind]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-1.5 border-b border-line bg-white text-[12px] text-ink-soft shrink-0">
        {state === "loading" ? a.loading
          : state === "error" ? <span className="text-red-700">{kind === "docx" ? a.wordFailed : a.pptFailed}</span>
          : a.officeNote}
      </div>
      <div ref={holder} className={`flex-1 min-h-0 overflow-auto ${kind === "pptx" ? "px-4 py-3 [&_.pptx-preview-wrapper]:!bg-transparent [&_.pptx-preview-wrapper]:!h-auto [&_.pptx-preview-wrapper]:!overflow-visible" : ""}`} dir="ltr" />
    </div>
  );
}
