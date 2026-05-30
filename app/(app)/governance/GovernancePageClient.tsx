"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { ComplianceFramework } from "@/lib/queries/gov-compliance";
import type { GovRegister } from "@/lib/queries/gov-registers";

type Props = {
  sectionCounts: Record<string, number>;
  registers:     GovRegister[];
  frameworks:    ComplianceFramework[];
};

const FW_SECTION_CODES = ["POLICY","PROCESS","STRATEGY","ROADMAP","STANDARD","TRAINING","REGULATORY"] as const;
type SectionCode = typeof FW_SECTION_CODES[number];

export function GovernancePageClient({ sectionCounts, registers, frameworks }: Props) {
  const { t, isRtl } = useLang();
  const g = t.governance;

  const sectionLabelMap: Record<SectionCode, string> = {
    POLICY:     g.sectionLabels.policy,
    PROCESS:    g.sectionLabels.process,
    STRATEGY:   g.sectionLabels.strategy,
    ROADMAP:    g.sectionLabels.roadmap,
    STANDARD:   g.sectionLabels.standard,
    TRAINING:   g.sectionLabels.training,
    REGULATORY: g.sectionLabels.regulatory,
  };

  const totalFwDocs  = Object.values(sectionCounts).reduce((a, b) => a + b, 0);
  const totalEntries = registers.reduce((a, r) => a + r.entryCount, 0);
  const primaryFw    = frameworks[0] ?? null;
  const compliantPct = primaryFw
    ? Math.round((primaryFw.completeCount / Math.max(primaryFw.reqCount, 1)) * 100)
    : 0;

  // Pluralisable sub-lines
  const fwSub     = isRtl
    ? `${FW_SECTION_CODES.length} أقسام · ${totalFwDocs} ${g.fw.docs}`
    : `${FW_SECTION_CODES.length} sections · ${totalFwDocs} ${g.fw.docs}`;
  const regSub    = isRtl
    ? `${registers.length} ${t.registers.pageTitle} · ${totalEntries} ${t.registers.entries}`
    : `${registers.length} register${registers.length !== 1 ? "s" : ""} · ${totalEntries} ${t.registers.entries}`;
  const compSub   = isRtl
    ? `${frameworks.length} إطار · ${primaryFw?.reqCount ?? 0} ${g.stats.requirements}`
    : `${frameworks.length} framework${frameworks.length !== 1 ? "s" : ""} · ${primaryFw?.reqCount ?? 0} ${g.stats.requirements}`;
  const ndiSub    = primaryFw
    ? `${primaryFw.completeCount} / ${primaryFw.reqCount} ${g.stats.requirements}`
    : g.stats.noFramework;

  return (
    <main className="px-8 py-7 pb-14">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-brand-deep mb-1">{g.pageTitle}</h1>
        <p className="text-ink-soft max-w-2xl">{g.pageDesc}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label={g.stats.fwDocs}            value={totalFwDocs}        sub={g.stats.acrossAllSections}    color="purple" />
        <StatCard label={g.stats.activeRegisters}   value={registers.length}   sub={`${totalEntries} ${g.stats.entriesTotal}`} color="blue" />
        <StatCard label={g.stats.ndiCompliance}     value={`${compliantPct}%`} sub={ndiSub}                       color="green" />
        <StatCard label={g.stats.frameworksTracked} value={frameworks.length}  sub={g.stats.complianceFrameworks} color="amber" />
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-3 gap-6">
        {/* Governance Framework */}
        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-brand-purple/10 flex items-center justify-center"><FwIcon /></span>
            <div>
              <h2 className="font-bold text-brand-deep">{g.framework}</h2>
              <p className="text-[12px] text-muted">{fwSub}</p>
            </div>
          </div>
          <p className="text-sm text-ink-soft mb-4 flex-1">{g.frameworkDesc}</p>
          <div className="space-y-1.5 mb-5">
            {FW_SECTION_CODES.map((code) => (
              <Link key={code} href={`/governance/framework/${code.toLowerCase()}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-canvas transition-colors group">
                <span className="text-sm font-medium text-ink group-hover:text-brand-purple">{sectionLabelMap[code]}</span>
                <span className="text-[11px] text-muted bg-canvas-soft px-2 py-0.5 rounded-full">{sectionCounts[code] ?? 0}</span>
              </Link>
            ))}
          </div>
          <Link href="/governance/framework" className="btn btn-primary btn-sm text-center">{g.frameworkOpen}</Link>
        </div>

        {/* Registers */}
        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><RegIcon /></span>
            <div>
              <h2 className="font-bold text-brand-deep">{g.registers}</h2>
              <p className="text-[12px] text-muted">{regSub}</p>
            </div>
          </div>
          <p className="text-sm text-ink-soft mb-4 flex-1">{g.registersDesc}</p>
          <div className="space-y-1.5 mb-5">
            {registers.map((r) => (
              <Link key={r.registerId} href={`/governance/registers/${r.registerId}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-canvas transition-colors group">
                <span className="text-sm font-medium text-ink group-hover:text-brand-purple truncate">{r.name}</span>
                <span className="text-[11px] text-muted bg-canvas-soft px-2 py-0.5 rounded-full shrink-0 ml-2">
                  {r.entryCount} {t.registers.entries}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/governance/registers" className="btn btn-primary btn-sm text-center">{g.registersOpen}</Link>
        </div>

        {/* Compliance */}
        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><CompIcon /></span>
            <div>
              <h2 className="font-bold text-brand-deep">{g.compliance}</h2>
              <p className="text-[12px] text-muted">{compSub}</p>
            </div>
          </div>
          <p className="text-sm text-ink-soft mb-4 flex-1">{g.complianceDesc}</p>
          {frameworks.length > 0 && (
            <div className="space-y-2 mb-5">
              {frameworks.map((f) => {
                const pct = Math.round((f.completeCount / Math.max(f.reqCount, 1)) * 100);
                return (
                  <Link key={f.frameworkId} href={`/governance/compliance?fw=${f.frameworkId}`}
                    className="block px-3 py-2 rounded-lg hover:bg-canvas transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-ink">{f.name}</span>
                      <span className="text-[11px] font-bold text-emerald-600">{pct}%</span>
                    </div>
                    <div className="h-1 bg-line rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <Link href="/governance/compliance" className="btn btn-primary btn-sm text-center">{g.complianceOpen}</Link>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub: string; color: "purple" | "blue" | "green" | "amber" }) {
  const colorClass = { purple: "text-brand-purple", blue: "text-blue-600", green: "text-emerald-600", amber: "text-amber-600" }[color];
  return (
    <div className="card p-4">
      <div className={`text-2xl font-extrabold mb-0.5 ${colorClass}`}>{value}</div>
      <div className="text-sm font-semibold text-ink">{label}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function FwIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-purple"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
}
function RegIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-blue-600"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>;
}
function CompIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>;
}
