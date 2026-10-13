"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { FW_SECTION_CODES, FW_SECTION_ICONS, fwSectionKey, fwSectionSlug } from "@/lib/gov-framework-sections";

type Props = {
  counts: Record<string, number>;
  /** Sections hidden from everyone who does not manage Data Governance. */
  hiddenSections: string[];
  canManage: boolean;
  /** Events scheduled in the Communication Plan that are still to come. */
  upcomingEvents: number;
};

export function FrameworkPageClient({ counts, hiddenSections, canManage, upcomingEvents }: Props) {
  const { t, isRtl } = useLang();
  const g = t.governance;

  const [hidden, setHidden] = useState(new Set(hiddenSections));
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(code: string) {
    const hide = !hidden.has(code);
    setBusy(code);
    try {
      const r = await fetch("/api/governance/framework/sections", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionCode: code, hidden: hide }),
      });
      if (!r.ok) return;
      setHidden((p) => { const next = new Set(p); if (hide) next.add(code); else next.delete(code); return next; });
    } finally { setBusy(null); }
  }

  // Those who manage the framework still see a hidden section (dimmed) so they can bring it back.
  const sections = FW_SECTION_CODES.filter((code) => canManage || !hidden.has(code));
  const shown = FW_SECTION_CODES.filter((code) => !hidden.has(code));
  const total = shown.reduce((sum, code) => sum + (counts[code] ?? 0), 0);
  const totalSub = isRtl
    ? `${total} ${g.fw.docs} عبر ${shown.length} أقسام`
    : `${total} ${total !== 1 ? "documents" : "document"} across ${shown.length} sections`;

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{g.framework}</h1>
          <p className="text-ink-soft text-sm mt-0.5">{totalSub}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {sections.map((code) => {
          const count = counts[code] ?? 0;
          const key = fwSectionKey(code);
          const isHidden = hidden.has(code);
          return (
            <div key={code} className={`card p-5 hover:border-brand-light hover:shadow-sm transition-all flex flex-col group relative ${isHidden ? "opacity-60 border-dashed" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{FW_SECTION_ICONS[code]}</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {isHidden && <span className="text-[11px] font-semibold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">{g.fw.hiddenBadge}</span>}
                  {code === "COMMUNICATION" && upcomingEvents > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full">{upcomingEvents} {g.fw.upcomingEvents}</span>
                  )}
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded-full">
                    {count} {g.fw.docs}
                  </span>
                </div>
              </div>
              <h3 className="font-bold text-brand-deep group-hover:text-brand-purple transition-colors mb-1">
                {/* The whole card opens the section; the Hide / Show button sits above this link. */}
                <Link href={`/governance/framework/${fwSectionSlug(code)}`} className="after:absolute after:inset-0">{g.sectionLabels[key]}</Link>
              </h3>
              <p className="text-[12px] text-muted flex-1">{g.sectionDescs[key]}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[12px] text-brand-purple font-semibold group-hover:underline">{g.fw.openArrow}</span>
                {canManage && (
                  <button type="button" onClick={() => toggle(code)} disabled={busy === code}
                    className="relative z-10 text-[11px] text-ink-soft hover:text-brand-purple border border-line rounded-md px-2 py-0.5 bg-white">
                    {isHidden ? g.fw.showSection : g.fw.hideSection}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {canManage && <p className="text-[11px] text-muted mt-4">{g.fw.hiddenNote}</p>}
    </main>
  );
}
