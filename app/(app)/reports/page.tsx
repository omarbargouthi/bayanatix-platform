import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Header } from "@/components/layout/Header";

type ReportTile = {
  code: string;
  name: string;
  description: string;
  href: string | null;
};

const REPORT_TILES: ReportTile[] = [
  { code: "R1", name: "Data Catalog / Metadata (MCM)", description: "Cataloged assets, ownership, and metadata completeness.", href: null },
  { code: "R2", name: "Data Quality (DQ)", description: "Rule coverage, pass rates, and open DQ issues.", href: "/reports/dq" },
  { code: "R3", name: "Data Classification (DC)", description: "Classification coverage and unclassified backlog.", href: null },
  { code: "R4", name: "Data Sharing (DSI)", description: "Sharing agreements, requests, and SLA response.", href: null },
  { code: "R5", name: "Open Data (OD)", description: "Dataset publication pipeline and SLA.", href: null },
  { code: "R6", name: "FOI", description: "Request status, fulfillment time, and appeals.", href: null },
  { code: "R7", name: "Personal Data Protection (PDP)", description: "PI classification and consent coverage.", href: null },
  { code: "R8", name: "Data Governance (DG) — Executive Summary", description: "Governance coverage, certification, and open tasks.", href: "/reports/dg-summary" },
];

export const dynamic = "force-dynamic";

export default async function ReportsIndexPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <>
      <Header crumbs={[{ label: "Bayanat", href: "/dashboard" }, { label: "Reports" }]} user={user} />
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-brand-deep mb-1">Reports</h1>
        <p className="text-sm text-muted mb-6">
          Standard per-domain status reports aligned with NDI monitoring evidence. R2 and R8 are live — the rest are on the roadmap.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REPORT_TILES.map((t) => {
            const content = (
              <div className={`card-padded h-full ${t.href ? "hover:shadow-md transition-shadow" : "opacity-50"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-purple">{t.code}</span>
                  {!t.href && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted bg-canvas px-2 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="font-semibold text-ink text-sm">{t.name}</div>
                <div className="text-xs text-muted mt-1">{t.description}</div>
              </div>
            );
            return t.href ? (
              <Link key={t.code} href={t.href}>{content}</Link>
            ) : (
              <div key={t.code}>{content}</div>
            );
          })}
        </div>
      </div>
    </>
  );
}
