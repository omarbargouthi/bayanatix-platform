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
      { text: "A daily check suggests an impact assessment for tables with sensitive or large-scale personal data, data shared outside the organisation or abroad, and processing activities that handle personal data, when no assessment covers them.", href: "/privacy/dpia" },
      { text: "Assessments are compared with the catalog: new personal-data columns, sensitive categories, sharing agreements or systems reached are flagged and notified to the owner and the privacy officers; review dates and overdue measures are reminded." },
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
      { text: "A records-of-processing template requires purpose and legal basis, and records data subject categories, cross-border transfers with destination countries, and the retention period.", href: "/assets" },
      { text: "Impact assessments (DPIA) are prefilled from the catalog: personal-data columns and categories, downstream flows from lineage, sharing agreements, clear-text access grants, retention and legal holds. Screening follows the Saudi PDPL or GDPR Art. 35 questionnaire.", href: "/privacy/dpia" },
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
      { text: "Data source passwords, AI provider keys and sign-in secrets are encrypted at rest with a key held outside the database: in the server environment (AES-256-GCM) or in the customer's HashiCorp Vault (Transit), where the key never leaves Vault. Each value records its key, so the key can be rotated and every secret re-encrypted, or moved to Vault, without re-entering passwords; each re-encryption is audited.", href: "/admin/configuration" },
      { text: "Passwords can stay in the customer's HashiCorp Vault altogether: a password field can hold a Vault reference instead, and Bayanis reads the value on each use without storing it, within the Vault paths the administrator allows." },
      { text: "Role-based access at domain, source, schema, table and column level; single sign-on with LDAP / Active Directory and OpenID Connect." },
      { text: "Security headers on every page, including a nonce-based Content-Security-Policy (only scripts carrying that request's one-time nonce can run), HSTS, clickjacking protection and a strict referrer policy." },
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
      { text: "When enabled by the administrator, users accept an activity-monitoring notice after signing in, explaining what is recorded and why; every decision is kept in a consent register, with the users who have not yet accepted, and can be exported.", href: "/admin/audit-logs?tab=consent" },
      { text: "Every impact assessment decision (approve, approve with conditions, return, reject) freezes a version that can be read and exported to PDF later; approving a high remaining risk requires the regulator consultation to be recorded.", href: "/privacy/dpia" },
    ],
  },
  {
    title: "7. Respect for user privacy",
    summary: "The interests of the people the data is about come first.",
    evidence: [
      { text: "Freedom-of-information requests are handled through a public portal with SLA tracking and an appeals process.", href: "/foi" },
      { text: "Access to personal data in clear text is tied to a purpose and legal basis, and every such access is logged." },
      { text: "Data subject requests (access, correction, erasure, restriction) are answered by following the retention path: the master table, its related tables and their PI columns, with legal-hold and retention-period exceptions, due dates and per-table tracking. Bayanis never stores the person's identity — the locate queries take it as a parameter.", href: "/privacy/requests" },
      { text: "Compliance assessments cover PDPL and other privacy regulations, with evidence and review.", href: "/governance/compliance" },
    ],
  },
];

const GAPS = [
  "Data-subject requests for Bayanis's own user accounts (export or erase a user's profile and activity) are handled manually.",
  "Personal-data breaches are not recorded in Bayanis: there is no breach register or tracking of the regulator and data-subject notification deadlines.",
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
