import { sql } from "../db";

export type ComplianceFramework = {
  frameworkId: number;
  name:        string;
  code:        string;
  version:     string | null;
  description: string | null;
  reqCount:    number;
  assessedCount: number;
  compliantCount: number;
};

export type ComplianceRequirement = {
  reqId:       number;
  frameworkId: number;
  reqCode:     string;
  category:    string | null;
  subCategory: string | null;
  reqText:     string;
  guidance:    string | null;
  sortOrder:   number;
  levelCode:   string;
  notes:       string | null;
  evidenceName: string | null;
  assessedBy:  string | null;
  assessedAt:  string | null;
};

export async function listFrameworks(): Promise<ComplianceFramework[]> {
  return sql<ComplianceFramework[]>`
    SELECT
      f.framework_id   AS "frameworkId",
      f.name, f.code, f.version, f.description,
      COUNT(r.req_id)::int                                                  AS "reqCount",
      COUNT(a.assessment_id)::int                                           AS "assessedCount",
      COUNT(CASE WHEN a.level_code='COMPLIANT' THEN 1 END)::int             AS "compliantCount"
    FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements r ON r.framework_id = f.framework_id
    LEFT JOIN bayanat.gov_compliance_assessments  a ON a.req_id = r.req_id AND a.level_code != 'NOT_ASSESSED'
    GROUP BY f.framework_id
    ORDER BY f.name
  `;
}

export async function getFramework(frameworkId: number): Promise<ComplianceFramework | null> {
  const rows = await listFrameworks();
  return rows.find((f) => f.frameworkId === frameworkId) ?? null;
}

export async function listRequirements(frameworkId: number): Promise<ComplianceRequirement[]> {
  return sql<ComplianceRequirement[]>`
    SELECT
      r.req_id        AS "reqId",
      r.framework_id  AS "frameworkId",
      r.req_code      AS "reqCode",
      r.category,
      r.sub_category  AS "subCategory",
      r.req_text      AS "reqText",
      r.guidance,
      r.sort_order    AS "sortOrder",
      COALESCE(a.level_code,'NOT_ASSESSED') AS "levelCode",
      a.notes,
      a.evidence_name AS "evidenceName",
      a.assessed_by   AS "assessedBy",
      a.assessed_at::text AS "assessedAt"
    FROM bayanat.gov_compliance_requirements r
    LEFT JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
    WHERE r.framework_id = ${frameworkId}
    ORDER BY r.sort_order, r.req_code
  `;
}

export async function upsertAssessment(reqId: number, levelCode: string, notes: string | null, assessedBy: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_compliance_assessments (req_id, level_code, notes, assessed_by, assessed_at)
    VALUES (${reqId}, ${levelCode}, ${notes}, ${assessedBy}, NOW())
    ON CONFLICT (req_id) DO UPDATE SET
      level_code  = EXCLUDED.level_code,
      notes       = EXCLUDED.notes,
      assessed_by = EXCLUDED.assessed_by,
      assessed_at = NOW()
  `;
}

export async function attachEvidence(reqId: number, fileName: string, fileData: Buffer | null): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_compliance_assessments (req_id, level_code, evidence_name, evidence_data)
    VALUES (${reqId}, 'NOT_ASSESSED', ${fileName}, ${fileData})
    ON CONFLICT (req_id) DO UPDATE SET
      evidence_name = EXCLUDED.evidence_name,
      evidence_data = EXCLUDED.evidence_data
  `;
}

export async function getEvidenceData(reqId: number): Promise<{ evidenceName: string; evidenceData: Buffer | null } | null> {
  const rows = await sql<{ evidenceName: string; evidenceData: Buffer | null }[]>`
    SELECT evidence_name AS "evidenceName", evidence_data AS "evidenceData"
    FROM bayanat.gov_compliance_assessments WHERE req_id = ${reqId}
  `;
  return rows[0] ?? null;
}

export async function createFramework(name: string, code: string, version: string | null, description: string | null): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description)
    VALUES (${name}, ${code}, ${version}, ${description})
    RETURNING framework_id AS id
  `;
  return rows[0].id;
}
