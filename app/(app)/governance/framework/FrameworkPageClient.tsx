"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";

const SECTION_ICONS: Record<string, string> = {
  POLICY: "📋", PROCESS: "⚙️", STRATEGY: "🎯",
  ROADMAP: "🗺️", STANDARD: "📐", TRAINING: "🎓", REGULATORY: "⚖️",
};

const SECTION_CODES = ["POLICY","PROCESS","STRATEGY","ROADMAP","STANDARD","TRAINING","REGULATORY"] as const;
type SectionCode = typeof SECTION_CODES[number];

type Props = { counts: Record<string, number> };

export function FrameworkPageClient({ counts }: Props) {
  const { t, isRtl } = useLang();
  const g = t.governance;

  const labelMap: Record<SectionCode, string> = {
    POLICY:     g.sectionLabels.policy,
    PROCESS:    g.sectionLabels.process,
    STRATEGY:   g.sectionLabels.strategy,
    ROADMAP:    g.sectionLabels.roadmap,
    STANDARD:   g.sectionLabels.standard,
    TRAINING:   g.sectionLabels.training,
    REGULATORY: g.sectionLabels.regulatory,
  };
  const descMap: Record<SectionCode, string> = {
    POLICY:     g.sectionDescs.policy,
    PROCESS:    g.sectionDescs.process,
    STRATEGY:   g.sectionDescs.strategy,
    ROADMAP:    g.sectionDescs.roadmap,
    STANDARD:   g.sectionDescs.standard,
    TRAINING:   g.sectionDescs.training,
    REGULATORY: g.sectionDescs.regulatory,
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalSub = isRtl
    ? `${total} ${g.fw.docs} عبر ${SECTION_CODES.length} أقسام`
    : `${total} ${total !== 1 ? "documents" : "document"} across ${SECTION_CODES.length} sections`;

  return (
    <main className="px-8 py-7 pb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{g.framework}</h1>
          <p className="text-ink-soft text-sm mt-0.5">{totalSub}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {SECTION_CODES.map((code) => {
          const count = counts[code] ?? 0;
          return (
            <Link key={code} href={`/governance/framework/${code.toLowerCase()}`}
              className="card p-5 hover:border-brand-light hover:shadow-sm transition-all flex flex-col group">
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{SECTION_ICONS[code]}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded-full">
                  {count} {g.fw.docs}
                </span>
              </div>
              <h3 className="font-bold text-brand-deep group-hover:text-brand-purple transition-colors mb-1">{labelMap[code]}</h3>
              <p className="text-[12px] text-muted flex-1">{descMap[code]}</p>
              <div className="mt-4 text-[12px] text-brand-purple font-semibold group-hover:underline">
                {g.fw.openArrow}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
