"use client";

// Which data protection laws apply to a new breach: those whose compliance framework is
// marked applicable in Regulation Setup (lib/privacy/breach.ts defaultBreachRegulations).
// Read-only here; each law brings its regulator notice and rule (BREACH_LAWS). A breach's
// handler can still change the laws on the breach itself.
import { useEffect, useState } from "react";
import Link from "next/link";
import { BREACH_LAWS, type BreachRegulation } from "@/lib/privacy/breach-types";

type LawFramework = { law: BreachRegulation; frameworkId: number | null; frameworkName: string | null; applicable: boolean };

const LAW_LABEL: Record<BreachRegulation, string> = {
  PDPL: "Saudi PDPL", GDPR: "EU GDPR", PIPEDA: "Canada PIPEDA", LAW25: "Québec Law 25", PHIPA: "Ontario PHIPA",
};
const RULE: Record<BreachRegulation, string> = {
  PDPL: "72 hours, for any risk to people",
  GDPR: "72 hours, unless unlikely to result in a risk",
  PIPEDA: "As soon as feasible, for a real risk of significant harm; records kept 24 months",
  LAW25: "Promptly, for a risk of serious injury; register kept at least 5 years",
  PHIPA: "People told whatever the risk; Commissioner in the prescribed cases; annual report",
};

export function BreachLawsConfig() {
  const [laws, setLaws] = useState<LawFramework[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/breach-settings").then((r) => (r.ok ? r.json() : { laws: [] })).then((d) => setLaws(d.laws));
  }, []);

  return (
    <section className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-brand-deep">Data breach laws</h3>
        <p className="text-[12px] text-muted mt-0.5">
          A new breach starts with the laws whose compliance framework is applicable; each adds a notice to its regulator
          with that law&apos;s deadline and threshold. Mark frameworks applicable in{" "}
          <Link href="/admin/maturity-index-setup" className="text-brand-purple hover:underline">Regulation Setup</Link>. The handler can still
          change the laws on each breach in <Link href="/privacy/breaches" className="text-brand-purple hover:underline">Data Privacy → Data Breaches</Link>.
        </p>
      </div>
      {!laws ? <div className="text-sm text-muted">Loading…</div> : (
        <div className="border border-line rounded-lg overflow-hidden">
          {laws.map((l) => (
            <div key={l.law} className="grid grid-cols-[150px_1fr_220px] gap-3 px-4 py-2.5 text-[13px] border-t first:border-t-0 border-line-soft items-start">
              <span className="text-ink font-medium">{LAW_LABEL[l.law]}</span>
              <span className="text-[12px] text-muted">{BREACH_LAWS[l.law].authority} · {RULE[l.law]}</span>
              <span className="text-[12px]">
                {l.frameworkId == null
                  ? <span className="text-muted">No framework with code <code className="font-mono">{BREACH_LAWS[l.law].framework}</code>: added on each breach by hand</span>
                  : <>
                      <Link href={`/governance/compliance?fw=${l.frameworkId}`} className="text-brand-purple hover:underline">{l.frameworkName}</Link>
                      {l.applicable ? <span className="text-emerald-700"> · applies to new breaches</span> : <span className="text-muted"> · not applicable</span>}
                    </>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
