import { sql } from "../db";
import type { GovernanceDomain, ComplianceSummary } from "../types";

export async function getDomains(): Promise<GovernanceDomain[]> {
  return sql<GovernanceDomain[]>`
    WITH maturity_raw AS (
      -- One row per (NDI domain code, standard) — averaging must give every
      -- standard equal weight, not one weight per requirement row (a standard
      -- can have anywhere from 1 to 16+ requirement rows across its levels).
      SELECT DISTINCT
             split_part(r.standard_code, '.', 1) AS ndi_domain_code,
             r.standard_code,
             COALESCE(s.selected_level, 0)       AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT ndi_domain_code,
             AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY ndi_domain_code
    ),
    domain_maturity AS (
      SELECT da.ndi_domain_code,
             ROUND(da.avg_level, 2) AS avg_level,
             lc.level_num,
             lc.name       AS level_name,
             lc.color_hex  AS level_color
      FROM   domain_avg da
      LEFT   JOIN bayanat.gov_compliance_level_config lc
        ON   lc.framework_id = 1
        AND  da.avg_level BETWEEN lc.range_from AND lc.range_to
    )
    SELECT
      d.domain_code          AS "domainCode",
      d.domain_name          AS "name",
      d.name_ar              AS "nameAr",
      d.domain_description   AS "description",
      d.description_ar       AS "descriptionAr",
      CASE
        WHEN d.domain_code = 'AIG' THEN 62
        WHEN dm.ndi_domain_code IS NOT NULL
          THEN ROUND(dm.avg_level / 5 * 100)::int
        ELSE d.compliance_pct
      END                    AS "compliancePct",
      CASE
        WHEN d.domain_code = 'AIG' THEN 3
        WHEN dm.ndi_domain_code IS NOT NULL THEN COALESCE(dm.level_num, 0)
        ELSE d.maturity_level
      END                    AS "maturityLevel",
      CASE
        WHEN d.domain_code = 'AIG' THEN 3.0
        WHEN dm.ndi_domain_code IS NOT NULL THEN dm.avg_level
        ELSE d.maturity_level::numeric
      END::float8               AS "maturityScore",
      CASE
        WHEN d.domain_code = 'AIG' THEN 'Activation'
        WHEN dm.ndi_domain_code IS NOT NULL THEN COALESCE(dm.level_name, 'No Capability')
        ELSE d.maturity_label
      END                    AS "level",
      CASE
        WHEN d.domain_code = 'AIG' THEN '#3D7EC8'
        ELSE COALESCE(dm.level_color, '#D84848')
      END                    AS "levelColor",
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
    LEFT   JOIN bayanat.gov_compliance_domain_config cfg
      ON   cfg.name_en = d.domain_name AND cfg.framework_id = 1
    LEFT   JOIN domain_maturity dm ON dm.ndi_domain_code = cfg.domain_code
    ORDER  BY d.sort_order ASC
  `;
}

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const rows = await sql<ComplianceSummary[]>`
    WITH maturity_raw AS (
      -- One row per (NDI domain code, standard) — see getDomains() for why
      -- this must not be one row per requirement.
      SELECT DISTINCT
             split_part(r.standard_code, '.', 1) AS ndi_domain_code,
             r.standard_code,
             COALESCE(s.selected_level, 0)       AS selected_level
      FROM   bayanat.gov_compliance_requirements r
      LEFT   JOIN bayanat.compliance_maturity_selections s
        ON   s.framework_id  = r.framework_id
        AND  s.standard_code = r.standard_code
      WHERE  r.compliance_or_maturity = 'نضج'
        AND  r.framework_id = 1
    ),
    domain_avg AS (
      SELECT ndi_domain_code, AVG(selected_level) AS avg_level
      FROM   maturity_raw
      GROUP  BY ndi_domain_code
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
      -- Overall maturity score (0-5) = weighted average of each domain's avg
      -- level, weighted by that domain's configured share (Configuration →
      -- NDI 2026 → Domain Configuration). Overall compliance is then just
      -- that score expressed as a fraction of 5, same as at the domain level.
      SELECT
        SUM(da.avg_level * cfg.weight) AS weighted_sum,
        SUM(cfg.weight)                AS weight_sum
      FROM   domain_avg da
      JOIN   bayanat.gov_compliance_domain_config cfg
        ON   cfg.domain_code = da.ndi_domain_code AND cfg.framework_id = 1
    )
    SELECT
      CASE WHEN wm.weight_sum > 0
        THEN ROUND(wm.weighted_sum / wm.weight_sum / 5 * 100)::int
        ELSE 0
      END                          AS "overallPct",
      CASE WHEN wm.weight_sum > 0
        THEN ROUND(wm.weighted_sum / wm.weight_sum / 5 * 100)::int
        ELSE 0
      END                          AS "overallMaturityPct",
      CASE WHEN wm.weight_sum > 0
        THEN ROUND(wm.weighted_sum / wm.weight_sum, 2)
        ELSE 0
      END::float8                  AS "overallMaturityScore",
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
    overallPct: 0, overallMaturityPct: 0, overallMaturityScore: 0,
    specsTracked: 0, domainsActive: 0, controlsPassing: 0, openFindings: 0,
  };
}
