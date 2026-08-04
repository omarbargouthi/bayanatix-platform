import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { getBusinessDomains } from "@/lib/queries/reports";
import { getStewardScopeInfo } from "@/lib/reports/access";

type ReportTile = {
  code: string;
  name: string;
  description: string;
  href: string;
};

const REPORT_TILES: ReportTile[] = [
  { code: "R1", name: "Data Catalog / Metadata (MCM)", description: "Cataloged assets, ownership, and metadata completeness.", href: "/reports/mcm" },
  { code: "R2", name: "Data Quality (DQ)", description: "Rule coverage, pass rates, and open DQ issues.", href: "/reports/dq" },
  { code: "R3", name: "Data Classification (DC)", description: "Classification coverage and unclassified backlog.", href: "/reports/dc" },
  { code: "R4", name: "Data Sharing (DSI)", description: "Sharing agreements, requests, and SLA response.", href: "/reports/dsi" },
  { code: "R5", name: "Open Data (OD)", description: "Dataset publication pipeline and SLA.", href: "/reports/od" },
  { code: "R6", name: "FOI", description: "Request status, fulfillment time, and appeals.", href: "/reports/foi" },
  { code: "R7", name: "Personal Data Protection (PDP)", description: "PI classification and consent coverage.", href: "/reports/pdp" },
  { code: "R8", name: "Data Governance (DG) — Executive Summary", description: "Governance coverage, certification, and open tasks.", href: "/reports/dg-summary" },
  { code: "R9", name: "Retention", description: "Schedules, overdue assets, and legal holds.", href: "/reports/retention" },
];

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  const [allDomains, scope] = await Promise.all([getBusinessDomains(), getStewardScopeInfo(user)]);
  const domains = scope.restricted ? allDomains.filter((d) => scope.allowedDomainIds.includes(d.glossaryId)) : allDomains;

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Reports" }]} user={user} />
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-brand-deep mb-1">Reports</h1>
          <p className="text-sm text-muted mb-6">
            Standard per-domain status reports aligned with NDI monitoring evidence.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {REPORT_TILES.map((t) => (
              <Link key={t.code} href={t.href}>
                <div className="card-padded h-full hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple">{t.code}</span>
                  </div>
                  <div className="font-semibold text-ink text-sm">{t.name}</div>
                  <div className="text-xs text-muted mt-1">{t.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink mb-1">Domain Scorecards</h2>
          <p className="text-xs text-muted mb-4">Cross-capability status for a single business domain — what's the status of Customer / Finance / HR data?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {domains.map((d) => (
              <Link key={d.glossaryId} href={`/reports/domain/${d.glossaryId}`}>
                <div className="card px-4 py-3 hover:shadow-md transition-shadow text-sm font-medium text-ink">{d.name}</div>
              </Link>
            ))}
            {domains.length === 0 && <div className="text-sm text-muted">No business domains available.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
