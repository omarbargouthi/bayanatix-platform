import { sql } from "../db";

export type ComplianceFramework = {
  frameworkId:    number;
  name:           string;
  code:           string;
  version:        string | null;
  description:    string | null;
  reqCount:       number;
  completeCount:  number;
  naCount:        number;
  notCompleteCount: number;
};

export type ComplianceRequirement = {
  reqId:               number;
  frameworkId:         number;
  reqCode:             string;
  // NDI spreadsheet fields (read-only)
  domain:              string | null;
  domainCode:          string | null;
  question:            string;
  maturityLevel:       string | null;
  supportingEvidence:  string | null;
  admissionCriteria:   string | null;
  directoryCode:       string | null;
  directoryType:       string | null;
  complianceOrMaturity: string | null;
  operationalExcellence: string | null;
  evidentAdministrator:  string | null;
  domainOwner:           string | null;
  managementSector:      string | null;
  sortOrder:           number;
  // Assessment fields (editable)
  submissionStatus:    string;  // COMPLETE | NOT_COMPLETE | NA
  evidentAdminOverride:  string | null;
  domainOwnerOverride:   string | null;
  comments:            string | null;
  evidenceName:        string | null;
  assessedBy:          string | null;
  assessedAt:          string | null;
};

export async function listFrameworks(): Promise<ComplianceFramework[]> {
  return sql<ComplianceFramework[]>`
    SELECT
      f.framework_id   AS "frameworkId",
      f.name, f.code, f.version, f.description,
      COUNT(r.req_id)::int AS "reqCount",
      COUNT(CASE WHEN a.submission_status='COMPLETE'     THEN 1 END)::int AS "completeCount",
      COUNT(CASE WHEN a.submission_status='NA'           THEN 1 END)::int AS "naCount",
      COUNT(CASE WHEN a.submission_status='NOT_COMPLETE' OR a.assessment_id IS NULL THEN 1 END)::int AS "notCompleteCount"
    FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements r ON r.framework_id = f.framework_id
    LEFT JOIN bayanat.gov_compliance_assessments  a ON a.req_id = r.req_id
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
      r.req_id                  AS "reqId",
      r.framework_id            AS "frameworkId",
      r.req_code                AS "reqCode",
      r.domain,
      r.domain_code             AS "domainCode",
      r.req_text                AS "question",
      r.maturity_level          AS "maturityLevel",
      r.supporting_evidence     AS "supportingEvidence",
      r.admission_criteria      AS "admissionCriteria",
      r.directory_code          AS "directoryCode",
      r.directory_type          AS "directoryType",
      r.compliance_or_maturity  AS "complianceOrMaturity",
      r.operational_excellence  AS "operationalExcellence",
      r.evident_administrator   AS "evidentAdministrator",
      r.domain_owner            AS "domainOwner",
      r.management_sector       AS "managementSector",
      r.sort_order              AS "sortOrder",
      COALESCE(a.submission_status, 'NOT_COMPLETE') AS "submissionStatus",
      a.evident_admin_override  AS "evidentAdminOverride",
      a.domain_owner_override   AS "domainOwnerOverride",
      a.comments,
      a.evidence_name           AS "evidenceName",
      a.assessed_by             AS "assessedBy",
      a.assessed_at::text       AS "assessedAt"
    FROM bayanat.gov_compliance_requirements r
    LEFT JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
    WHERE r.framework_id = ${frameworkId}
    ORDER BY r.sort_order, r.req_code
  `;
}

export async function upsertAssessment(reqId: number, fields: {
  submissionStatus?: string;
  evidentAdminOverride?: string | null;
  domainOwnerOverride?: string | null;
  comments?: string | null;
  assessedBy: string;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_compliance_assessments
      (req_id, submission_status, evident_admin_override, domain_owner_override, comments, assessed_by, assessed_at)
    VALUES (
      ${reqId},
      ${fields.submissionStatus ?? 'NOT_COMPLETE'},
      ${fields.evidentAdminOverride ?? null},
      ${fields.domainOwnerOverride ?? null},
      ${fields.comments ?? null},
      ${fields.assessedBy},
      NOW()
    )
    ON CONFLICT (req_id) DO UPDATE SET
      submission_status      = COALESCE(EXCLUDED.submission_status,      gov_compliance_assessments.submission_status),
      evident_admin_override = COALESCE(EXCLUDED.evident_admin_override, gov_compliance_assessments.evident_admin_override),
      domain_owner_override  = COALESCE(EXCLUDED.domain_owner_override,  gov_compliance_assessments.domain_owner_override),
      comments               = COALESCE(EXCLUDED.comments,               gov_compliance_assessments.comments),
      assessed_by            = EXCLUDED.assessed_by,
      assessed_at            = NOW()
  `;
}

export async function attachEvidence(reqId: number, fileName: string, fileData: Buffer | null): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_compliance_assessments (req_id, submission_status, evidence_name, evidence_data)
    VALUES (${reqId}, 'NOT_COMPLETE', ${fileName}, ${fileData})
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

export async function importRequirements(
  frameworkId: number,
  rows: Array<{
    reqCode: string; domain: string; domainCode: string; question: string;
    maturityLevel: string; supportingEvidence: string; admissionCriteria: string;
    directoryCode: string; directoryType: string; complianceOrMaturity: string;
    operationalExcellence: string; evidentAdministrator: string;
    domainOwner: string; managementSector: string; sortOrder: number;
  }>
): Promise<void> {
  // Delete all existing requirements for this framework (assessments cascade)
  await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE framework_id = ${frameworkId}`;

  if (rows.length === 0) return;

  // Batch insert all rows
  for (const r of rows) {
    await sql`
      INSERT INTO bayanat.gov_compliance_requirements
        (framework_id, req_code, req_text, domain, domain_code, maturity_level,
         supporting_evidence, admission_criteria, directory_code, directory_type,
         compliance_or_maturity, operational_excellence, evident_administrator,
         domain_owner, management_sector, sort_order)
      VALUES (
        ${frameworkId}, ${r.reqCode}, ${r.question}, ${r.domain || null},
        ${r.domainCode || null}, ${r.maturityLevel || null},
        ${r.supportingEvidence || null}, ${r.admissionCriteria || null},
        ${r.directoryCode || null}, ${r.directoryType || null},
        ${r.complianceOrMaturity || null}, ${r.operationalExcellence || null},
        ${r.evidentAdministrator || null}, ${r.domainOwner || null},
        ${r.managementSector || null}, ${r.sortOrder}
      )
    `;
  }
}

export async function listDomains(frameworkId: number): Promise<string[]> {
  const rows = await sql<{ domain: string }[]>`
    SELECT DISTINCT COALESCE(domain, 'Other') AS domain
    FROM bayanat.gov_compliance_requirements
    WHERE framework_id = ${frameworkId} AND domain IS NOT NULL
    ORDER BY domain
  `;
  return rows.map((r) => r.domain);
}
