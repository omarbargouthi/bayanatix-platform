"use client";

import type { BusinessDomain, SourceLite, UserLite } from "@/lib/queries/reports";

const SELECT_CLASS = "bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-purple";

export function ReportFilterBar({
  domains, sources, owners, domainId, sourceId, ownerId, onChange, domainLocked,
}: {
  domains: BusinessDomain[];
  sources: SourceLite[];
  owners: UserLite[];
  domainId: string;
  sourceId: string;
  ownerId: string;
  onChange: (key: "domain" | "source" | "owner", value: string) => void;
  domainLocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        className={`${SELECT_CLASS} ${domainLocked ? "opacity-70 cursor-not-allowed" : ""}`}
        value={domainId}
        disabled={domainLocked}
        title={domainLocked ? "Your account is scoped to this business domain" : undefined}
        onChange={(e) => onChange("domain", e.target.value)}
      >
        {!domainLocked && <option value="">All Business Domains</option>}
        {domains.map((d) => (
          <option key={d.glossaryId} value={d.glossaryId}>{d.name}</option>
        ))}
      </select>
      <select className={SELECT_CLASS} value={sourceId} onChange={(e) => onChange("source", e.target.value)}>
        <option value="">All Data Sources</option>
        {sources.map((s) => (
          <option key={s.dataSourceId} value={s.dataSourceId}>{s.sourceName}</option>
        ))}
      </select>
      <select className={SELECT_CLASS} value={ownerId} onChange={(e) => onChange("owner", e.target.value)}>
        <option value="">All Owners</option>
        {owners.map((u) => (
          <option key={u.userId} value={u.userId}>{u.fullName}</option>
        ))}
      </select>
      <span className="text-xs text-muted">Period: current month</span>
    </div>
  );
}
