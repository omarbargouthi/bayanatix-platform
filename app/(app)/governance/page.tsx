import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts } from "@/lib/queries/gov-framework";
import { listRegisters } from "@/lib/queries/gov-registers";
import { listFrameworks } from "@/lib/queries/gov-compliance";

export const dynamic = "force-dynamic";

const FW_SECTIONS = [
  { code: "POLICY",     label: "Policies",               description: "Enterprise policies enforced across domains" },
  { code: "PROCESS",    label: "Processes",               description: "How policies are implemented and enforced" },
  { code: "STRATEGY",   label: "Strategy",                description: "Endorsed data management strategies" },
  { code: "ROADMAP",    label: "Roadmap",                 description: "Approved data governance roadmaps" },
  { code: "STANDARD",   label: "Standards & Guidelines",  description: "Technical and business standards" },
  { code: "TRAINING",   label: "Training Material",       description: "Training resources and learning materials" },
  { code: "REGULATORY", label: "Regulatory",              description: "Regulatory compliance documentation" },
];

export default async function GovernancePage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [sectionCounts, registers, frameworks] = await Promise.all([
    getSectionCounts(),
    listRegisters(),
    listFrameworks(),
  ]);

  const totalFwDocs   = Object.values(sectionCounts).reduce((a, b) => a + b, 0);
  const totalEntries  = registers.reduce((a, r) => a + r.entryCount, 0);
  const primaryFw     = frameworks[0] ?? null;
  const compliantPct  = primaryFw
    ? Math.round((primaryFw.completeCount / Math.max(primaryFw.reqCount, 1)) * 100)
    : 0;

  return (
    <>
      <Header
        crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Data Governance" }]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-brand-deep mb-1">Data Governance</h1>
          <p className="text-ink-soft max-w-2xl">
            Manage your organisation's governance framework documents, maintain operational registers,
            and track compliance against NDI requirements.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Framework Documents" value={totalFwDocs} sub="across all sections" color="purple" />
          <StatCard label="Active Registers"    value={registers.length} sub={`${totalEntries} entries total`} color="blue" />
          <StatCard label="NDI Compliance"      value={`${compliantPct}%`} sub={primaryFw ? `${primaryFw.completeCount} / ${primaryFw.reqCount} requirements` : "No framework loaded"} color="green" />
          <StatCard label="Frameworks Tracked"  value={frameworks.length} sub="compliance frameworks" color="amber" />
        </div>

        {/* 3 main category cards */}
        <div className="grid grid-cols-3 gap-6">
          {/* Governance Framework */}
          <div className="card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-brand-purple/10 flex items-center justify-center">
                <FwIcon />
              </span>
              <div>
                <h2 className="font-bold text-brand-deep">Governance Framework</h2>
                <p className="text-[12px] text-muted">{FW_SECTIONS.length} sections · {totalFwDocs} documents</p>
              </div>
            </div>
            <p className="text-sm text-ink-soft mb-4 flex-1">
              Policies, processes, strategies, roadmaps, standards, training materials, and regulatory documents.
            </p>
            <div className="space-y-1.5 mb-5">
              {FW_SECTIONS.map((s) => (
                <Link key={s.code} href={`/governance/framework/${s.code.toLowerCase()}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-canvas transition-colors group">
                  <span className="text-sm font-medium text-ink group-hover:text-brand-purple">{s.label}</span>
                  <span className="text-[11px] text-muted bg-canvas-soft px-2 py-0.5 rounded-full">
                    {sectionCounts[s.code] ?? 0}
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/governance/framework" className="btn btn-primary btn-sm text-center">
              Open Framework
            </Link>
          </div>

          {/* Registers */}
          <div className="card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <RegIcon />
              </span>
              <div>
                <h2 className="font-bold text-brand-deep">Registers</h2>
                <p className="text-[12px] text-muted">{registers.length} registers · {totalEntries} entries</p>
              </div>
            </div>
            <p className="text-sm text-ink-soft mb-4 flex-1">
              Maintain operational governance registers with configurable columns and structured data entry.
            </p>
            <div className="space-y-1.5 mb-5">
              {registers.map((r) => (
                <Link key={r.registerId} href={`/governance/registers/${r.registerId}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-canvas transition-colors group">
                  <span className="text-sm font-medium text-ink group-hover:text-brand-purple truncate">{r.name}</span>
                  <span className="text-[11px] text-muted bg-canvas-soft px-2 py-0.5 rounded-full shrink-0 ml-2">
                    {r.entryCount} entries
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/governance/registers" className="btn btn-primary btn-sm text-center">
              Open Registers
            </Link>
          </div>

          {/* Compliance */}
          <div className="card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CompIcon />
              </span>
              <div>
                <h2 className="font-bold text-brand-deep">Compliance</h2>
                <p className="text-[12px] text-muted">{frameworks.length} framework{frameworks.length !== 1 ? "s" : ""} · {primaryFw?.reqCount ?? 0} requirements</p>
              </div>
            </div>
            <p className="text-sm text-ink-soft mb-4 flex-1">
              Assess organisational compliance against NDI 2026 and other regulatory frameworks. Upload evidence per requirement.
            </p>
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
            <Link href="/governance/compliance" className="btn btn-primary btn-sm text-center">
              Open Compliance
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub: string; color: "purple" | "blue" | "green" | "amber" }) {
  const bg = { purple: "bg-brand-purple/10 text-brand-purple", blue: "bg-blue-500/10 text-blue-600", green: "bg-emerald-500/10 text-emerald-600", amber: "bg-amber-500/10 text-amber-600" }[color];
  return (
    <div className="card p-4">
      <div className={`text-2xl font-extrabold mb-0.5 ${bg.split(" ")[1]}`}>{value}</div>
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
