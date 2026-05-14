import { sql } from "../db";

export type ComplianceFramework = {
  frameworkId:      number;
  name:             string;
  code:             string;
  version:          string | null;
  description:      string | null;
  reqCount:         number;
  completeCount:    number;
  naCount:          number;
  notCompleteCount: number;
};

export type ComplianceRequirement = {
  reqId:                 number;
  frameworkId:           number;
  reqCode:               string;
  standard:              string | null;
  standardCode:          string | null;
  // NDI spreadsheet fields (read-only from import)
  domain:                string | null;
  domainCode:            string | null;
  question:              string;
  maturityLevel:         string | null;
  supportingEvidence:    string | null;
  admissionCriteria:     string | null;
  directoryCode:         string | null;
  directoryType:         string | null;
  complianceOrMaturity:  string | null;
  operationalExcellence: string | null;
  evidentAdministrator:  string | null;
  domainOwner:           string | null;
  managementSector:      string | null;
  sortOrder:             number;
  // Assessment fields (editable)
  submissionStatus:      string;   // COMPLETE | NOT_COMPLETE | NA
  evidentAdminOverride:  string | null;
  domainOwnerOverride:   string | null;
  comments:              string | null;
  evidenceName:          string | null;
  assessedBy:            string | null;
  assessedAt:            string | null;
};

export type LevelConfig = {
  configId:    number;
  frameworkId: number;
  levelNum:    number;
  name:        string;
  colorHex:    string;
  description: string | null;
};

export type UserOption = {
  userId:   string;
  fullName: string | null;
  email:    string;
};

// ── Frameworks ───────────────────────────────────────────────────────────────

export async function listFrameworks(): Promise<ComplianceFramework[]> {
  return sql<ComplianceFramework[]>`
    SELECT
      f.framework_id   AS "frameworkId",
      f.name, f.code, f.version, f.description,
      COUNT(r.req_id)::int AS "reqCount",
      COUNT(CASE WHEN a.submission_status = 'COMPLETE'                        THEN 1 END)::int AS "completeCount",
      COUNT(CASE WHEN a.submission_status = 'NA'                              THEN 1 END)::int AS "naCount",
      COUNT(CASE WHEN a.submission_status = 'NOT_COMPLETE' OR a.assessment_id IS NULL THEN 1 END)::int AS "notCompleteCount"
    FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements  r ON r.framework_id = f.framework_id
    LEFT JOIN bayanat.gov_compliance_assessments   a ON a.req_id       = r.req_id
    GROUP BY f.framework_id
    ORDER BY f.name
  `;
}

export async function getFramework(frameworkId: number): Promise<ComplianceFramework | null> {
  const rows = await listFrameworks();
  return rows.find((f) => f.frameworkId === frameworkId) ?? null;
}

export async function createFramework(
  name: string, code: string, version: string | null, description: string | null
): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description)
    VALUES (${name}, ${code}, ${version}, ${description})
    RETURNING framework_id AS id
  `;
  return rows[0].id;
}

// ── Requirements ─────────────────────────────────────────────────────────────

export async function listRequirements(frameworkId: number): Promise<ComplianceRequirement[]> {
  return sql<ComplianceRequirement[]>`
    SELECT
      r.req_id                  AS "reqId",
      r.framework_id            AS "frameworkId",
      r.req_code                AS "reqCode",
      r.standard,
      r.standard_code           AS "standardCode",
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

export async function importRequirements(
  frameworkId: number,
  rows: Array<{
    reqCode: string; standard: string; standardCode: string;
    domain: string; domainCode: string; question: string;
    maturityLevel: string; supportingEvidence: string; admissionCriteria: string;
    directoryCode: string; directoryType: string; complianceOrMaturity: string;
    operationalExcellence: string; evidentAdministrator: string;
    domainOwner: string; managementSector: string; sortOrder: number;
  }>
): Promise<void> {
  await sql`DELETE FROM bayanat.gov_compliance_requirements WHERE framework_id = ${frameworkId}`;
  if (rows.length === 0) return;
  for (const r of rows) {
    await sql`
      INSERT INTO bayanat.gov_compliance_requirements
        (framework_id, req_code, standard, standard_code, req_text, domain, domain_code,
         maturity_level, supporting_evidence, admission_criteria, directory_code, directory_type,
         compliance_or_maturity, operational_excellence, evident_administrator,
         domain_owner, management_sector, sort_order)
      VALUES (
        ${frameworkId}, ${r.reqCode}, ${r.standard || null}, ${r.standardCode || null},
        ${r.question}, ${r.domain || null}, ${r.domainCode || null},
        ${r.maturityLevel || null}, ${r.supportingEvidence || null},
        ${r.admissionCriteria || null}, ${r.directoryCode || null}, ${r.directoryType || null},
        ${r.complianceOrMaturity || null}, ${r.operationalExcellence || null},
        ${r.evidentAdministrator || null}, ${r.domainOwner || null},
        ${r.managementSector || null}, ${r.sortOrder}
      )
    `;
  }
}

// ── Assessment ───────────────────────────────────────────────────────────────

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
      ${fields.domainOwnerOverride  ?? null},
      ${fields.comments             ?? null},
      ${fields.assessedBy},
      NOW()
    )
    ON CONFLICT (req_id) DO UPDATE SET
      submission_status      = COALESCE(EXCLUDED.submission_status,      gov_compliance_assessments.submission_status),
      evident_admin_override = EXCLUDED.evident_admin_override,
      domain_owner_override  = EXCLUDED.domain_owner_override,
      comments               = EXCLUDED.comments,
      assessed_by            = EXCLUDED.assessed_by,
      assessed_at            = NOW()
  `;
}

export async function attachEvidence(reqId: number, fileName: string, fileData: Buffer): Promise<void> {
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

// ── Level configuration ───────────────────────────────────────────────────────

export async function getLevelConfig(frameworkId: number): Promise<LevelConfig[]> {
  const rows = await sql<LevelConfig[]>`
    SELECT
      config_id    AS "configId",
      framework_id AS "frameworkId",
      level_num    AS "levelNum",
      name,
      color_hex    AS "colorHex",
      description
    FROM bayanat.gov_compliance_level_config
    WHERE framework_id = ${frameworkId}
    ORDER BY level_num
  `;
  // Fill any missing levels with defaults
  const defaults = [
    { name: "No Capability", colorHex: "#D84848", description: "" },
    { name: "Build",         colorHex: "#E88030", description: "" },
    { name: "Definition",    colorHex: "#2D4AA0", description: "" },
    { name: "Activation",    colorHex: "#3D7EC8", description: "" },
    { name: "Managed",       colorHex: "#1E8C76", description: "" },
    { name: "Innovation",    colorHex: "#5CA85C", description: "" },
  ];
  return Array.from({ length: 6 }, (_, i) => {
    const existing = rows.find((r) => r.levelNum === i);
    return existing ?? { configId: 0, frameworkId, levelNum: i, ...defaults[i] };
  });
}

export async function saveLevelConfig(
  frameworkId: number,
  levels: Array<{ levelNum: number; name: string; colorHex: string; description: string | null }>
): Promise<void> {
  for (const l of levels) {
    await sql`
      INSERT INTO bayanat.gov_compliance_level_config
        (framework_id, level_num, name, color_hex, description)
      VALUES (${frameworkId}, ${l.levelNum}, ${l.name}, ${l.colorHex}, ${l.description ?? null})
      ON CONFLICT (framework_id, level_num) DO UPDATE SET
        name        = EXCLUDED.name,
        color_hex   = EXCLUDED.color_hex,
        description = EXCLUDED.description
    `;
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserOption[]> {
  return sql<UserOption[]>`
    SELECT user_id AS "userId", full_name AS "fullName", email
    FROM bayanat.users
    WHERE is_active = true
    ORDER BY full_name
  `;
}

// ── Domains (for legacy use) ──────────────────────────────────────────────────

export async function listDomains(frameworkId: number): Promise<string[]> {
  const rows = await sql<{ domain: string }[]>`
    SELECT DISTINCT COALESCE(domain, 'Other') AS domain
    FROM bayanat.gov_compliance_requirements
    WHERE framework_id = ${frameworkId} AND domain IS NOT NULL
    ORDER BY domain
  `;
  return rows.map((r) => r.domain);
}
