import { sql } from "../db";
import type { GovernanceDomain, ComplianceSummary } from "../types";

export async function getDomains(): Promise<GovernanceDomain[]> {
  return sql<GovernanceDomain[]>`
    select
      d.domain_code        as "domainCode",
      d.domain_name        as "name",
      d.name_ar            as "nameAr",
      d.domain_description as "description",
      d.description_ar     as "descriptionAr",
      d.compliance_pct     as "compliancePct",
      d.maturity_level     as "maturityLevel",
      d.maturity_label     as "level",
      d.alert_count        as "alertCount",
      d.sort_order         as "sortOrder",
      (
        select count(*)::int
        from bayanat.asset_request_targets art
        join bayanat.asset_requests ar on ar.request_id = art.request_id
        where art.asset_type_code = 'GOVERNANCE_DOMAIN'
          and art.asset_id_text = d.domain_code
          and ar.status_code in ('OPEN','IN_PROGRESS')
      ) as "openRequestCount"
    from bayanat.governance_domains d
    order by d.sort_order asc
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
