import Link from "next/link";
import { verifyLicense } from "@/lib/license/verify";

// Curated, not queried -- this exists to answer a regulatory ask ("show you have
// a valid DG license and a features list"), so it should read as a deliberate
// statement of product scope, not an auto-generated dump of every route.
const FEATURES = [
  "Data Catalog (sources, schemas, tables, columns)",
  "Data Classification & Sensitivity Levels",
  "Data Quality Rules & Monitoring",
  "Business Glossary & Data Definitions",
  "Custom Attributes (extended metadata)",
  "Data Lineage (upstream/downstream impact analysis)",
  "Data Retention Schedules & Legal Holds",
  "Regulatory Compliance Assessments (multi-framework: PDPL, NDI, BCBS239, PIPEDA, and others)",
  "Open Data Portal",
  "Data Sharing Agreements",
  "Freedom of Information (FOI) Request Management",
  "Reports & KPI Dashboards",
  "AI-Assisted Data Enrichment",
  "Bulk Metadata Operations",
  "Role-Based Access Control & Audit Logging",
  "Bilingual Interface (English / Arabic)",
  "AI Chat Assistant (\"Ask Bayanis\")",
];

export default async function AboutPage() {
  const license = await verifyLicense(process.env.LICENSE_KEY);
  const isGrace = license.state === "grace";
  const badgeClass = isGrace ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const badgeLabel = isGrace ? "Expiring Soon" : "Active";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">About Bayanis</h1>
        <p className="text-sm text-ink-soft mt-1">Data Governance Platform</p>
      </div>

      <div className="bg-white border border-line rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">License</h2>
          {(license.state === "active" || license.state === "grace") && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>{badgeLabel}</span>
          )}
        </div>
        {(license.state === "active" || license.state === "grace") ? (
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-ink-soft">Licensed to</dt>
            <dd className="text-ink font-medium">{license.customerName}</dd>
            <dt className="text-ink-soft">Valid until</dt>
            <dd className="text-ink font-medium">{new Date(license.expiresAt).toLocaleDateString()}</dd>
            <dt className="text-ink-soft">Days remaining</dt>
            <dd className="text-ink font-medium">{license.daysRemaining}</dd>
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">No valid license information is available.</p>
        )}
      </div>

      <div className="bg-white border border-line rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Licensed Features</h2>
        <ul className="text-sm text-ink-soft space-y-1.5 list-disc list-inside">
          {FEATURES.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </div>

      <Link href="/about/privacy" className="block bg-white border border-line rounded-xl p-5 hover:border-brand-purple/40 transition-colors">
        <h2 className="text-sm font-semibold text-ink">Privacy by Design →</h2>
        <p className="text-[13px] text-ink-soft mt-1">How Bayanis follows the seven Privacy by Design principles, with the product behaviour behind each and the known gaps.</p>
      </Link>
    </div>
  );
}
