import { sql } from "../db";
import type { GovernanceDomain, ComplianceSummary } from "../types";

export async function getDomains(): Promise<GovernanceDomain[]> {
  return sql<GovernanceDomain[]>`
    WITH maturity_raw AS (
      SELECT r.domain_code,
             COALESCE(s.selected_level, 0) AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT domain_code,
             AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY domain_code
    ),
    domain_maturity AS (
      SELECT da.domain_code,
             da.avg_level,
             lc.level_num,
             lc.name AS level_name
      FROM   domain_avg da
      LEFT   JOIN bayanat.gov_compliance_level_config lc
        ON   lc.framework_id = 1
        AND  da.avg_level BETWEEN lc.range_from AND lc.range_to
    ),
    compliance_raw AS (
      SELECT r.domain_code,
             a.submission_status,
             -- Workflow status derived from the standard engine (asset_requests +
             -- workflow_stage_history) via review_request_id — mirrors
             -- deriveWorkflowStatus() in lib/queries/gov-compliance.ts.
             CASE
               WHEN ar.status_code = 'RESOLVED' THEN 'ENDORSED'
               WHEN ar.status_code = 'CLOSED'   THEN 'REJECTED'
               WHEN confirm.completed_at IS NOT NULL THEN 'CONFIRMED'
               WHEN r.review_request_id IS NOT NULL   THEN 'SUBMITTED'
               ELSE 'DRAFT'
             END AS wf_status
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
      LEFT   JOIN bayanat.asset_requests ar ON ar.request_id = r.review_request_id
      LEFT   JOIN bayanat.workflow_instances wi ON wi.request_id = ar.request_id
      LEFT   JOIN LATERAL (
        SELECT h.completed_at FROM bayanat.workflow_stage_history h
        JOIN bayanat.workflow_stages s ON s.stage_id = h.stage_id
        WHERE h.instance_id = wi.instance_id AND s.stage_order = 1
        LIMIT 1
      ) confirm ON true
      WHERE  r.compliance_or_maturity = 'امتثال'
        AND  r.framework_id = 1
    ),
    domain_compliance AS (
      SELECT domain_code,
             COUNT(*)::int AS total,
             COUNT(CASE
               WHEN submission_status = 'COMPLETE'
                 OR wf_status IN ('CONFIRMED','ENDORSED')
               THEN 1 END)::int AS done
      FROM   compliance_raw
      GROUP  BY domain_code
    )
    SELECT
      d.domain_code          AS "domainCode",
      d.domain_name          AS "name",
      d.name_ar              AS "nameAr",
      d.domain_description   AS "description",
      d.description_ar       AS "descriptionAr",
      CASE
        WHEN d.domain_code = 'AIG' THEN 62
        WHEN dc.total > 0
          THEN ROUND(dc.done::numeric / dc.total * 100)::int
        ELSE d.compliance_pct
      END                    AS "compliancePct",
      CASE
        WHEN d.domain_code = 'AIG' THEN 3
        WHEN dm.domain_code IS NOT NULL THEN COALESCE(dm.level_num, 0)
        ELSE d.maturity_level
      END                    AS "maturityLevel",
      CASE
        WHEN d.domain_code = 'AIG' THEN 'Activation'
        WHEN dm.domain_code IS NOT NULL THEN COALESCE(dm.level_name, 'No Capability')
        ELSE d.maturity_label
      END                    AS "level",
      d.alert_count          AS "alertCount",
      d.sort_order           AS "sortOrder",
      COALESCE(cfg.weight, 0) AS "weight",
      (
        SELECT COUNT(*)::int
        FROM   bayanat.asset_request_targets art
        JOIN   bayanat.asset_requests ar ON ar.request_id = art.request_id
        WHERE  art.asset_type_code = 'GOVERNANCE_DOMAIN'
          AND  art.asset_id_text   = d.domain_code
          AND  ar.status_code IN ('OPEN','IN_PROGRESS')
      )                      AS "openRequestCount"
    FROM   bayanat.governance_domains d
    LEFT   JOIN domain_maturity dm   ON dm.domain_code  = d.domain_code
    LEFT   JOIN domain_compliance dc ON dc.domain_code  = d.domain_code
    LEFT   JOIN bayanat.gov_compliance_domain_config cfg
      ON   cfg.domain_code = d.domain_code AND cfg.framework_id = 1
    ORDER  BY d.sort_order ASC
  `;
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const rows = await sql<ComplianceSummary[]>`
    WITH maturity_raw AS (
      SELECT r.domain_code,
             COALESCE(s.selected_level, 0) AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT domain_code, AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY domain_code
    ),
    domain_maturity AS (
      SELECT da.domain_code, da.avg_level
      FROM   domain_avg da
      LEFT   JOIN bayanat.gov_compliance_level_config lc
        ON   lc.framework_id = 1 AND da.avg_level BETWEEN lc.range_from AND lc.range_to
    ),
    compliance_raw AS (
      SELECT a.submission_status,
             CASE
               WHEN ar.status_code = 'RESOLVED' THEN 'ENDORSED'
               WHEN ar.status_code = 'CLOSED'   THEN 'REJECTED'
               WHEN confirm.completed_at IS NOT NULL THEN 'CONFIRMED'
               WHEN r.review_request_id IS NOT NULL   THEN 'SUBMITTED'
               ELSE 'DRAFT'
             END AS wf_status
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
      LEFT   JOIN bayanat.asset_requests ar ON ar.request_id = r.review_request_id
      LEFT   JOIN bayanat.workflow_instances wi ON wi.request_id = ar.request_id
      LEFT   JOIN LATERAL (
        SELECT h.completed_at FROM bayanat.workflow_stage_history h
        JOIN bayanat.workflow_stages s ON s.stage_id = h.stage_id
        WHERE h.instance_id = wi.instance_id AND s.stage_order = 1
        LIMIT 1
      ) confirm ON true
      WHERE  r.compliance_or_maturity = 'امتثال'
        AND  r.framework_id = 1
    ),
    comp_totals AS (
      SELECT
        COUNT(*)::int AS total_comp,
        COUNT(CASE
          WHEN submission_status = 'COMPLETE'
            OR wf_status IN ('CONFIRMED','ENDORSED')
          THEN 1 END)::int AS done_comp
      FROM compliance_raw
    ),
    weighted_maturity AS (
      SELECT
        SUM(dm.avg_level / 5.0 * 100 * cfg.weight) AS weighted_sum,
        SUM(cfg.weight)                             AS weight_sum
      FROM   domain_maturity dm
      JOIN   bayanat.gov_compliance_domain_config cfg
        ON   cfg.domain_code = dm.domain_code AND cfg.framework_id = 1
    )
    SELECT
      CASE WHEN ct.total_comp > 0
        THEN ROUND(ct.done_comp::numeric / ct.total_comp * 100)::int
        ELSE 0
      END                          AS "overallPct",
      CASE WHEN wm.weight_sum > 0
        THEN ROUND(wm.weighted_sum / wm.weight_sum)::int
        ELSE 0
      END                          AS "overallMaturityPct",
      (
        SELECT COUNT(*)::int
        FROM   bayanat.gov_compliance_requirements
        WHERE  framework_id = 1
      )                            AS "specsTracked",
      (
        SELECT COUNT(DISTINCT domain_code)::int
        FROM   bayanat.gov_compliance_requirements
        WHERE  framework_id = 1
      )                            AS "domainsActive",
      ct.done_comp                 AS "controlsPassing",
      0                            AS "openFindings"
    FROM comp_totals ct
    CROSS JOIN weighted_maturity wm
  `;
  return rows[0] ?? {
    overallPct: 0, overallMaturityPct: 0,
    specsTracked: 0, domainsActive: 0, controlsPassing: 0, openFindings: 0,
  };
}
