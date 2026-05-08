import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getDomains, getComplianceSummary } from "@/lib/queries/domains";
import { Donut } from "@/components/ui/Donut";
import { DomainCard } from "@/components/catalog/DomainCard";
import { MaturityChart } from "@/components/catalog/MaturityChart";
import { Tag } from "@/components/ui/Tag";
import { IconSearch, IconDB, IconReports, IconBook, IconChat, IconCircle } from "@/components/layout/icons";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [domains, summary] = await Promise.all([getDomains(), getComplianceSummary()]);
  const firstName = user.fullName.split(" ")[0];

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Dashboard" }]} user={user} />

      <main className="px-8 py-7 pb-14">
        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#f0f2ff] via-[#e7ecfb] to-[#e6e0f5] border border-line p-9 mb-6">
          <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full bg-brand-light/45 blur-2xl" />
          <div className="absolute -bottom-16 left-[10%] w-48 h-48 rounded-full bg-brand-purple/25 blur-2xl" />

          <div className="relative">
            <h1 className="text-2xl font-bold text-brand-deep mb-4">Welcome, {firstName} 👋</h1>

            <div className="flex items-center gap-2.5 bg-white border border-line rounded-lg shadow-sm px-4 py-3 max-w-2xl">
              <IconSearch className="w-5 h-5 text-muted" />
              <input
                className="flex-1 bg-transparent border-0 outline-none text-[15px] placeholder:text-muted"
                placeholder="Search across schemas, tables, glossaries, reports…"
              />
              <button className="btn btn-primary btn-sm !py-2 !px-4">Search</button>
            </div>

            <div className="flex flex-wrap gap-4 mt-4">
              <SearchCat label="Tables"     Icon={IconDB} />
              <SearchCat label="Reports"    Icon={IconReports} />
              <SearchCat label="Glossary"   Icon={IconBook} />
              <SearchCat label="Stewards"   Icon={IconCircle} />
              <SearchCat label="Dashboards" Icon={IconChat} />
              <SearchCat label="Domains"    Icon={IconCircle} />
            </div>
          </div>
        </section>

        {/* Two metric cards */}
        <section className="grid grid-cols-2 gap-5 mb-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-base font-bold">Overall Compliance</h3>
              <Tag variant="purple">Q4 2025</Tag>
            </div>
            <div className="flex items-center gap-6">
              <Donut value={summary.overallPct} label="Compliant" size={160} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
                <Stat label="Specs tracked"   value={summary.specsTracked} />
                <Stat label="Domains active"  value={`${summary.domainsActive} / 14`} />
                <Stat label="Controls passing" value={summary.controlsPassing} />
                <Stat label="Open findings"   value={summary.openFindings} />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-base font-bold">Overall Maturity</h3>
              <div className="flex items-center gap-3 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-purple" /> This year
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-brand-light" /> Last year
                </span>
              </div>
            </div>
            <MaturityChart />
          </div>
        </section>

        {/* Domain grid */}
        <section>
          <h2 className="text-xl font-bold mb-4">NDMO Domains</h2>
          <div className="grid grid-cols-3 gap-5">
            {domains.map((d) => (
              <DomainCard key={d.domainCode} d={d} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-base font-bold text-ink">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

function SearchCat({ label, Icon }: { label: string; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <button className="flex flex-col items-center gap-1 text-ink-soft hover:text-brand-purple transition-colors">
      <span className="w-9 h-9 grid place-items-center bg-white/70 rounded-md text-brand-navy">
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}
