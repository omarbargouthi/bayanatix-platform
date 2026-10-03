import Link from "next/link";

// Privacy by Design evidence: each of the seven foundational principles mapped to
// the concrete Bayanis behaviour that demonstrates it. Curated on purpose (like
// the About page's feature list) — every line must stay true of the shipped
// product; update it whenever one of these behaviours changes. Known gaps are
// listed openly at the end rather than glossed over.
const PRINCIPLES: { title: string; summary: string; evidence: { text: string; href?: string }[] }[] = [
  {
    title: "1. Proactive, not reactive",
    summary: "Privacy risks are found and handled before they cause harm.",
    evidence: [
      { text: "Classification scans detect sensitive information types (national IDs, emails, phone numbers and more, by country) and suggest them for review.", href: "/classification" },
      { text: "Personal-data classification flows automatically to every downstream copy of a column through lineage.", href: "/lineage?view=propagation" },
      { text: "\"Assess a change\" shows every downstream asset before a column is changed and asks its owners to review.", href: "/lineage" },
      { text: "Schema changes found by re-crawls raise a metadata-update review for the table's stewards." },
    ],
  },
  {
    title: "2. Privacy as the default setting",
    summary: "Personal data is protected without anyone having to ask for it.",
    evidence: [
      { text: "Personal-data columns are masked by default in live sample data." },
      { text: "Seeing them in clear text needs an approved request with a stated legal basis, routed through a workflow." },
      { text: "Viewing live data is a separate privilege, not granted automatically to stewards." },
      { text: "Bayanis does not keep minimum, maximum, frequent or failing sample values of personal-data columns; data-quality samples are deleted after 90 days." },
      { text: "External AI providers receive no sample values by default; only self-hosted models inside your network may." , href: "/admin/ai-providers" },
    ],
  },
  {
    title: "3. Privacy embedded into the design",
    summary: "Privacy is part of the catalog itself, not a separate add-on.",
    evidence: [
      { text: "Every classification term carries a personal-data flag and category, shown wherever the column appears." },
      { text: "Retention categories, legal holds with record-level conditions, and purge manifests sit alongside the catalog.", href: "/privacy" },
      { text: "A records-of-processing template requires purpose and legal basis.", href: "/assets" },
      { text: "Data-sharing agreements and the open-data workflow check classification before anything is published.", href: "/sharing" },
    ],
  },
  {
    title: "4. Full functionality: positive-sum, not zero-sum",
    summary: "Protection does not stop people from doing their job.",
    evidence: [
      { text: "Masked samples still show structure, row counts and non-personal columns, so stewards can work without seeing personal values." },
      { text: "Profiles keep null %, distinct counts and quality scores for personal-data columns; only the values themselves are hidden." },
      { text: "AI features can run on a self-hosted model, so enrichment needs no data to leave your environment." },
    ],
  },
  {
    title: "5. End-to-end security: lifecycle protection",
    summary: "Data is protected from collection to deletion.",
    evidence: [
      { text: "Data source passwords and AI provider keys are encrypted at rest (AES-256-GCM)." },
      { text: "Role-based access at domain, source, schema, table and column level; single sign-on with LDAP / Active Directory and OpenID Connect." },
      { text: "Security headers on every page, including a Content-Security-Policy, HSTS, clickjacking protection and a strict referrer policy." },
      { text: "Retention schedules drive deletion, with legal holds that block it where required.", href: "/privacy" },
      { text: "Bayanis's own records (audit log, data access log, job logs, notifications, data-quality samples) are deleted automatically after the retention periods set by the administrator.", href: "/admin/configuration" },
    ],
  },
  {
    title: "6. Visibility and transparency",
    summary: "What happens to data and metadata can be shown and checked.",
    evidence: [
      { text: "Audit log of every metadata change, by user or system.", href: "/admin/audit-logs?tab=audit" },
      { text: "Data access log of every view of live data, recording whether personal-data columns were masked or shown in clear text.", href: "/admin/audit-logs?tab=data-access" },
      { text: "Manual lineage changes go through approval and keep a full history; inherited classifications show where they came from.", href: "/lineage?view=register" },
      { text: "Every background job (crawls, imports, exports, propagation) keeps a log.", href: "/admin/audit-logs?tab=job-logs" },
      { text: "When enabled by the administrator, users accept an activity-monitoring notice after signing in, explaining what is recorded and why; every decision is kept as evidence." },
    ],
  },
  {
    title: "7. Respect for user privacy",
    summary: "The interests of the people the data is about come first.",
    evidence: [
      { text: "Freedom-of-information requests are handled through a public portal with SLA tracking and an appeals process.", href: "/foi" },
      { text: "Access to personal data in clear text is tied to a purpose and legal basis, and every such access is logged." },
      { text: "Compliance assessments cover PDPL and other privacy regulations, with evidence and review.", href: "/governance/compliance" },
    ],
  },
];

const GAPS = [
  "Data-subject requests for Bayanis's own user accounts (export or erase a user's profile and activity) are handled manually.",
  "The Content-Security-Policy still allows inline scripts (needed by the framework); nonce-based scripts are planned.",
  "Encryption keys are rotated manually; there is no built-in key-rotation tool yet.",
];

export default function PrivacyByDesignPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/about" className="text-[12px] text-brand-purple hover:underline">← About Bayanis</Link>
        <h1 className="text-xl font-bold text-ink mt-2">Privacy by Design</h1>
        <p className="text-sm text-ink-soft mt-1 max-w-3xl">
          How Bayanis follows the seven foundational principles of Privacy by Design. Each principle lists the
          behaviour in the product that demonstrates it; known gaps are listed at the end.
        </p>
      </div>

      {PRINCIPLES.map((p) => (
        <section key={p.title} className="bg-white border border-line rounded-xl p-5">
          <h2 className="text-[15px] font-bold text-brand-deep">{p.title}</h2>
          <p className="text-[13px] text-ink-soft mt-0.5 mb-3">{p.summary}</p>
          <ul className="space-y-2">
            {p.evidence.map((e) => (
              <li key={e.text} className="flex items-start gap-2.5 text-[13px] text-ink">
                <span className="mt-0.5 text-emerald-600 font-bold shrink-0">✓</span>
                <span>
                  {e.text}
                  {e.href && <> <Link href={e.href} className="text-brand-purple hover:underline whitespace-nowrap">Open →</Link></>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="bg-amber-50/60 border border-amber-200 rounded-xl p-5">
        <h2 className="text-[15px] font-bold text-amber-900">Known gaps and planned work</h2>
        <ul className="mt-2 space-y-1.5">
          {GAPS.map((g) => (
            <li key={g} className="flex items-start gap-2.5 text-[13px] text-amber-900">
              <span className="shrink-0">•</span><span>{g}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
