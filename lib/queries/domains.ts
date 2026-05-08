import { sql } from "../db";
import type { GovernanceDomain, ComplianceSummary } from "../types";

export async function getDomains(): Promise<GovernanceDomain[]> {
  return sql<GovernanceDomain[]>`
    select
      domain_code        as "domainCode",
      domain_name        as "name",
      domain_description as "description",
      compliance_pct     as "compliancePct",
      maturity_level     as "maturityLevel",
      maturity_label     as "level",
      alert_count        as "alertCount",
      sort_order         as "sortOrder"
    from bayanat.governance_domains
    order by sort_order asc
  `;
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const rows = await sql<ComplianceSummary[]>`
    select
      coalesce(round(avg(compliance_pct))::int, 0)  as "overallPct",
      coalesce(sum(specs_tracked), 0)::int          as "specsTracked",
      count(*)::int                                 as "domainsActive",
      coalesce(sum(controls_passing), 0)::int       as "controlsPassing",
      coalesce(sum(open_findings), 0)::int          as "openFindings"
    from bayanat.governance_domains
  `;
  return (
    rows[0] ?? { overallPct: 0, specsTracked: 0, domainsActive: 0, controlsPassing: 0, openFindings: 0 }
  );
}
