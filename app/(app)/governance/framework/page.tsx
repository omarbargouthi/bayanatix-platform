import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getSectionCounts } from "@/lib/queries/gov-framework";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { code: "POLICY",     label: "Policies",              icon: "📋", description: "Company policies that must be enforced across the enterprise. Upload approved policies for employee reference and link them to related assets." },
  { code: "PROCESS",    label: "Processes",             icon: "⚙️",  description: "Documentation explaining how policies are implemented and enforced — the operational 'how'." },
  { code: "STRATEGY",   label: "Strategy",              icon: "🎯", description: "Endorsed data management strategies aligned to organisational objectives." },
  { code: "ROADMAP",    label: "Roadmap",               icon: "🗺️",  description: "Approved data governance roadmaps showing planned initiatives and timelines." },
  { code: "STANDARD",   label: "Standards & Guidelines",icon: "📐", description: "Technical and business standards, guidelines, and best practices." },
  { code: "TRAINING",   label: "Training Material",     icon: "🎓", description: "Training resources, e-learning content, and reference materials for staff." },
  { code: "REGULATORY", label: "Regulatory",            icon: "⚖️",  description: "Regulatory and legal compliance documentation, including NDMO, NDI, and PDPL requirements." },
];

export default async function FrameworkPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const counts = await getSectionCounts();
  const total  = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Data Governance", href: "/governance" },
          { label: "Governance Framework" },
        ]}
        user={user}
      />
      <main className="px-8 py-7 pb-14">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-deep">Governance Framework</h1>
            <p className="text-ink-soft text-sm mt-0.5">{total} document{total !== 1 ? "s" : ""} across {SECTIONS.length} sections</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {SECTIONS.map((s) => {
            const count = counts[s.code] ?? 0;
            return (
              <Link key={s.code} href={`/governance/framework/${s.code.toLowerCase()}`}
                className="card p-5 hover:border-brand-light hover:shadow-sm transition-all flex flex-col group">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-brand-purple/10 text-brand-purple rounded-full">
                    {count} doc{count !== 1 ? "s" : ""}
                  </span>
                </div>
                <h3 className="font-bold text-brand-deep group-hover:text-brand-purple transition-colors mb-1">{s.label}</h3>
                <p className="text-[12px] text-muted flex-1">{s.description}</p>
                <div className="mt-4 text-[12px] text-brand-purple font-semibold group-hover:underline">
                  Open →
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
