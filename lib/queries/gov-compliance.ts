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
  submissionStatus:      string;
  evidentAdminOverride:  string | null;
  domainOwnerOverride:   string | null;
  managementNotes:       string | null;
  comments:              string | null;
  evidenceName:          string | null;
  assessedBy:            string | null;
  assessedAt:            string | null;
  // Workflow
  workflowStatus:        string | null;
  endorsedBy:            string | null;
  endorsedAt:            string | null;
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

export type ConfigItem = {
  itemId:      number;
  configGroup: string;
  code:        string;
  label:       string;
  labelAr:     string | null;
  colorHex:    string | null;
  sortOrder:   number;
};

export type MaturitySelection = {
  standardCode:   string;
  selectedLevel:  number;
  selectedBy:     string;
  selectedAt:     string;
};

export type HistoryEntry = {
  historyId:      number;
  fieldName:      string;
  fieldLabel:     string;
  oldValue:       string | null;
  newValue:       string | null;
  changedBy:      string;
  changedByName:  string | null;
  changedAt:      string;
};

const FIELD_LABELS: Record<string, string> = {
  submissionStatus:     "Submission Status",
  evidentAdminOverride: "Evident Administrator",
  domainOwnerOverride:  "Domain Owner",
  managementNotes:      "Management & Supporting Sector",
  comments:             "Comments",
  evidenceFile:         "Evidence File",
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
      a.management_notes        AS "managementNotes",
      a.comments,
      a.evidence_name           AS "evidenceName",
      a.assessed_by             AS "assessedBy",
      a.assessed_at::text       AS "assessedAt",
      w.status                  AS "workflowStatus",
      w.endorsed_by             AS "endorsedBy",
      w.endorsed_at::text       AS "endorsedAt"
    FROM bayanat.gov_compliance_requirements r
    LEFT JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
    LEFT JOIN bayanat.compliance_workflow         w ON w.req_id = r.req_id
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

export async function updateRequirement(reqId: number, fields: {
  standard?: string;
  question?: string;
  maturityLevel?: string;
  supportingEvidence?: string;
  admissionCriteria?: string;
  directoryCode?: string;
  directoryType?: string;
  complianceOrMaturity?: string;
  evidentAdministrator?: string;
  domainOwner?: string;
  managementSector?: string;
}): Promise<void> {
  await sql`
    UPDATE bayanat.gov_compliance_requirements SET
      standard               = COALESCE(${fields.standard              ?? null}, standard),
      req_text               = COALESCE(${fields.question              ?? null}, req_text),
      maturity_level         = COALESCE(${fields.maturityLevel         ?? null}, maturity_level),
      supporting_evidence    = COALESCE(${fields.supportingEvidence    ?? null}, supporting_evidence),
      admission_criteria     = COALESCE(${fields.admissionCriteria     ?? null}, admission_criteria),
      directory_code         = COALESCE(${fields.directoryCode         ?? null}, directory_code),
      directory_type         = COALESCE(${fields.directoryType         ?? null}, directory_type),
      compliance_or_maturity = COALESCE(${fields.complianceOrMaturity  ?? null}, compliance_or_maturity),
      evident_administrator  = COALESCE(${fields.evidentAdministrator  ?? null}, evident_administrator),
      domain_owner           = COALESCE(${fields.domainOwner           ?? null}, domain_owner),
      management_sector      = COALESCE(${fields.managementSector      ?? null}, management_sector)
    WHERE req_id = ${reqId}
  `;
}

// ── Assessment ───────────────────────────────────────────────────────────────

export async function upsertAssessment(reqId: number, fields: {
  submissionStatus?: string;
  evidentAdminOverride?: string | null;
  domainOwnerOverride?: string | null;
  managementNotes?: string | null;
  comments?: string | null;
  assessedBy: string;
  assessedByName?: string;
}): Promise<void> {
  const existing = await sql<{
    submission_status: string;
    evident_admin_override: string | null;
    domain_owner_override: string | null;
    management_notes: string | null;
    comments: string | null;
  }[]>`
    SELECT submission_status, evident_admin_override, domain_owner_override, management_notes, comments
    FROM bayanat.gov_compliance_assessments WHERE req_id = ${reqId}
  `;
  const prev = existing[0] ?? null;

  await sql`
    INSERT INTO bayanat.gov_compliance_assessments
      (req_id, submission_status, evident_admin_override, domain_owner_override, management_notes, comments, assessed_by, assessed_at)
    VALUES (
      ${reqId},
      ${fields.submissionStatus ?? 'NOT_COMPLETE'},
      ${fields.evidentAdminOverride ?? null},
      ${fields.domainOwnerOverride  ?? null},
      ${fields.managementNotes      ?? null},
      ${fields.comments             ?? null},
      ${fields.assessedBy},
      NOW()
    )
    ON CONFLICT (req_id) DO UPDATE SET
      submission_status      = COALESCE(EXCLUDED.submission_status, gov_compliance_assessments.submission_status),
      evident_admin_override = EXCLUDED.evident_admin_override,
      domain_owner_override  = EXCLUDED.domain_owner_override,
      management_notes       = EXCLUDED.management_notes,
      comments               = EXCLUDED.comments,
      assessed_by            = EXCLUDED.assessed_by,
      assessed_at            = NOW()
  `;

  const req = await sql<{ framework_id: number }[]>`
    SELECT framework_id FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId}
  `;
  const fwId = req[0]?.framework_id ?? 0;
  const byName = fields.assessedByName ?? fields.assessedBy;

  const changes: Array<{ field: string; old: string | null; nw: string | null }> = [
    { field: "submissionStatus",      old: prev?.submission_status      ?? null, nw: fields.submissionStatus      ?? null },
    { field: "evidentAdminOverride",  old: prev?.evident_admin_override  ?? null, nw: fields.evidentAdminOverride  ?? null },
    { field: "domainOwnerOverride",   old: prev?.domain_owner_override   ?? null, nw: fields.domainOwnerOverride   ?? null },
    { field: "managementNotes",       old: prev?.management_notes        ?? null, nw: fields.managementNotes       ?? null },
    { field: "comments",              old: prev?.comments                ?? null, nw: fields.comments              ?? null },
  ];

  for (const c of changes) {
    const oldTrimmed = c.old?.trim() ?? null;
    const newTrimmed = c.nw?.trim()  ?? null;
    if (oldTrimmed !== newTrimmed && (oldTrimmed !== null || newTrimmed !== null)) {
      await sql`
        INSERT INTO bayanat.gov_compliance_history
          (req_id, framework_id, field_name, old_value, new_value, changed_by)
        VALUES (${reqId}, ${fwId}, ${c.field}, ${c.old}, ${c.nw}, ${byName})
      `;
    }
  }
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

// ── Maturity level selection ──────────────────────────────────────────────────

export async function getMaturitySelections(frameworkId: number): Promise<MaturitySelection[]> {
  return sql<MaturitySelection[]>`
    SELECT
      standard_code  AS "standardCode",
      selected_level AS "selectedLevel",
      selected_by    AS "selectedBy",
      selected_at::text AS "selectedAt"
    FROM bayanat.compliance_maturity_selections
    WHERE framework_id = ${frameworkId}
  `;
}

export async function setMaturitySelection(
  frameworkId: number,
  standardCode: string,
  selectedLevel: number,
  selectedBy: string
): Promise<void> {
  await sql`
    INSERT INTO bayanat.compliance_maturity_selections
      (framework_id, standard_code, selected_level, selected_by, selected_at)
    VALUES (${frameworkId}, ${standardCode}, ${selectedLevel}, ${selectedBy}, NOW())
    ON CONFLICT (framework_id, standard_code) DO UPDATE SET
      selected_level = EXCLUDED.selected_level,
      selected_by    = EXCLUDED.selected_by,
      selected_at    = NOW()
  `;
}

export async function clearStandardAssessments(frameworkId: number, standardCode: string): Promise<void> {
  // Clear assessments for all requirements of this standard
  await sql`
    DELETE FROM bayanat.gov_compliance_assessments
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId} AND standard = ${standardCode}
    )
  `;
  // Clear workflow states
  await sql`
    DELETE FROM bayanat.compliance_workflow
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId} AND standard = ${standardCode}
    )
  `;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export async function getWorkflow(reqId: number) {
  const rows = await sql<{
    workflowId: number; status: string;
    submittedBy: string | null; submittedAt: string | null;
    confirmedBy: string | null; confirmedAt: string | null;
    endorsedBy: string | null; endorsedAt: string | null;
  }[]>`
    SELECT
      workflow_id   AS "workflowId",
      status,
      submitted_by  AS "submittedBy",
      submitted_at::text AS "submittedAt",
      confirmed_by  AS "confirmedBy",
      confirmed_at::text AS "confirmedAt",
      endorsed_by   AS "endorsedBy",
      endorsed_at::text  AS "endorsedAt"
    FROM bayanat.compliance_workflow WHERE req_id = ${reqId}
  `;
  return rows[0] ?? null;
}

export async function advanceWorkflow(
  reqId: number,
  frameworkId: number,
  action: "submit" | "confirm" | "endorse",
  byUser: string
): Promise<void> {
  const existing = await sql`SELECT workflow_id FROM bayanat.compliance_workflow WHERE req_id = ${reqId}`;

  if (existing.length === 0) {
    await sql`
      INSERT INTO bayanat.compliance_workflow (req_id, framework_id, status, updated_at)
      VALUES (${reqId}, ${frameworkId}, 'DRAFT', NOW())
    `;
  }

  if (action === "submit") {
    await sql`
      UPDATE bayanat.compliance_workflow
      SET status = 'SUBMITTED', submitted_by = ${byUser}, submitted_at = NOW(), updated_at = NOW()
      WHERE req_id = ${reqId} AND status = 'DRAFT'
    `;
    await sql`
      INSERT INTO bayanat.gov_compliance_history
        (req_id, framework_id, field_name, old_value, new_value, changed_by)
      VALUES (${reqId}, ${frameworkId}, 'workflowStatus', 'DRAFT', 'SUBMITTED', ${byUser})
    `;
  } else if (action === "confirm") {
    await sql`
      UPDATE bayanat.compliance_workflow
      SET status = 'CONFIRMED', confirmed_by = ${byUser}, confirmed_at = NOW(), updated_at = NOW()
      WHERE req_id = ${reqId} AND status = 'SUBMITTED'
    `;
    await sql`
      INSERT INTO bayanat.gov_compliance_history
        (req_id, framework_id, field_name, old_value, new_value, changed_by)
      VALUES (${reqId}, ${frameworkId}, 'workflowStatus', 'SUBMITTED', 'CONFIRMED', ${byUser})
    `;
  } else if (action === "endorse") {
    await sql`
      UPDATE bayanat.compliance_workflow
      SET status = 'ENDORSED', endorsed_by = ${byUser}, endorsed_at = NOW(), updated_at = NOW()
      WHERE req_id = ${reqId} AND status = 'CONFIRMED'
    `;
    await sql`
      INSERT INTO bayanat.gov_compliance_history
        (req_id, framework_id, field_name, old_value, new_value, changed_by)
      VALUES (${reqId}, ${frameworkId}, 'workflowStatus', 'CONFIRMED', 'ENDORSED', ${byUser})
    `;
  }
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getRequirementHistory(reqId: number): Promise<HistoryEntry[]> {
  const rows = await sql<{
    historyId: number; fieldName: string; oldValue: string | null;
    newValue: string | null; changedBy: string; changedAt: string;
    changedByName: string | null;
  }[]>`
    SELECT
      h.history_id AS "historyId",
      h.field_name AS "fieldName",
      h.old_value  AS "oldValue",
      h.new_value  AS "newValue",
      h.changed_by AS "changedBy",
      h.changed_at::text AS "changedAt",
      u.full_name  AS "changedByName"
    FROM bayanat.gov_compliance_history h
    LEFT JOIN bayanat.users u ON u.user_id = h.changed_by OR u.full_name = h.changed_by
    WHERE h.req_id = ${reqId}
    ORDER BY h.changed_at DESC
    LIMIT 50
  `;
  return rows.map((r) => ({
    ...r,
    fieldLabel: FIELD_LABELS[r.fieldName] ?? r.fieldName,
  }));
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

// ── Config items ──────────────────────────────────────────────────────────────

export async function getConfigItems(frameworkId: number): Promise<ConfigItem[]> {
  return sql<ConfigItem[]>`
    SELECT
      item_id      AS "itemId",
      config_group AS "configGroup",
      code,
      label,
      label_ar     AS "labelAr",
      color_hex    AS "colorHex",
      sort_order   AS "sortOrder"
    FROM bayanat.compliance_config_items
    WHERE framework_id = ${frameworkId}
    ORDER BY config_group, sort_order
  `;
}

export async function upsertConfigItem(frameworkId: number, item: {
  configGroup: string; code: string; label: string;
  labelAr?: string | null; colorHex?: string | null; sortOrder?: number;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.compliance_config_items
      (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
    VALUES (
      ${frameworkId}, ${item.configGroup}, ${item.code}, ${item.label},
      ${item.labelAr ?? null}, ${item.colorHex ?? null}, ${item.sortOrder ?? 0}
    )
    ON CONFLICT (framework_id, config_group, code) DO UPDATE SET
      label      = EXCLUDED.label,
      label_ar   = EXCLUDED.label_ar,
      color_hex  = EXCLUDED.color_hex,
      sort_order = EXCLUDED.sort_order
  `;
}

export async function deleteConfigItem(frameworkId: number, configGroup: string, code: string): Promise<void> {
  await sql`
    DELETE FROM bayanat.compliance_config_items
    WHERE framework_id = ${frameworkId} AND config_group = ${configGroup} AND code = ${code}
  `;
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

// ── Collab (compliance-linked threads) ────────────────────────────────────────

export async function getCollabThreadCounts(reqIds: number[]): Promise<Record<number, number>> {
  if (reqIds.length === 0) return {};
  const rows = await sql<{ reqId: number; count: number }[]>`
    SELECT ar.asset_id::int AS "reqId", COUNT(*)::int AS count
    FROM bayanat.collab_asset_refs ar
    WHERE ar.asset_type = 'COMPLIANCE_EVIDENCE'
      AND ar.asset_id::int = ANY(${reqIds})
    GROUP BY ar.asset_id
  `;
  return Object.fromEntries(rows.map((r) => [r.reqId, r.count]));
}

// ── Domains ──────────────────────────────────────────────────────────────────

export async function listDomains(frameworkId: number): Promise<string[]> {
  const rows = await sql<{ domain: string }[]>`
    SELECT DISTINCT COALESCE(domain, 'Other') AS domain
    FROM bayanat.gov_compliance_requirements
    WHERE framework_id = ${frameworkId} AND domain IS NOT NULL
    ORDER BY domain
  `;
  return rows.map((r) => r.domain);
}

export { FIELD_LABELS };
