import { sql } from "../db";
import { logUpdate } from "../audit";
import { startWorkflow } from "../workflow";

export type ComplianceFramework = {
  frameworkId:         number;
  name:                string;
  code:                string;
  version:             string | null;
  description:         string | null;
  regulationGroupCode: string | null;
  isApplicable:        boolean;
  assessmentMode:      "MATURITY" | "COMPLIANCE_ONLY";
  reqCount:            number;
  completeCount:       number;
  naCount:             number;
  notCompleteCount:    number;
};

export type ComplianceRequirement = {
  reqId:                 number;
  frameworkId:           number;
  reqCode:               string;
  standard:              string | null;
  standardCode:          string | null;
  standardAr:            string | null;
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
  // English translations (from NDI English file)
  questionEn:            string | null;
  supportingEvidenceEn:  string | null;
  admissionCriteriaEn:   string | null;
  managementSectorEn:    string | null;
  domainEn:              string | null;
  directoryTypeEn:       string | null;
  // Assessment fields (editable)
  submissionStatus:      string;
  evidentAdminOverride:  string | null;
  domainOwnerOverride:   string | null;
  supportingEvidenceOverride: string | null;
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
  configId:      number;
  frameworkId:   number;
  levelNum:      number;
  name:          string;
  colorHex:      string;
  description:   string | null;
  nameAr:        string | null;
  descriptionAr: string | null;
  rangeFrom:     number | null;
  rangeTo:       number | null;
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

/** includeInactive=false restricts to frameworks the admin has marked applicable to this organization. */
export async function listFrameworks(includeInactive = true): Promise<ComplianceFramework[]> {
  return sql<ComplianceFramework[]>`
    SELECT
      f.framework_id   AS "frameworkId",
      f.name, f.code, f.version, f.description,
      f.regulation_group_code AS "regulationGroupCode", f.is_applicable_indicator AS "isApplicable",
      f.assessment_mode AS "assessmentMode",
      COUNT(r.req_id)::int AS "reqCount",
      -- COMPLETE/COMPLIANCE, NOT_COMPLETE/PARTIAL_COMPLIANCE/NON_COMPLIANCE: NDI's
      -- Complete/Not-Completed/N-A codes and the simplified Compliance/Partial/Non/N-A
      -- codes used by PDPL/DCC/CST both bucket into the same 3 summary counts.
      COUNT(CASE WHEN a.submission_status IN ('COMPLETE', 'COMPLIANCE')                     THEN 1 END)::int AS "completeCount",
      COUNT(CASE WHEN a.submission_status = 'NA'                                            THEN 1 END)::int AS "naCount",
      COUNT(CASE WHEN a.submission_status IN ('NOT_COMPLETE', 'PARTIAL_COMPLIANCE', 'NON_COMPLIANCE')
                 OR a.assessment_id IS NULL                                                 THEN 1 END)::int AS "notCompleteCount"
    FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements  r ON r.framework_id = f.framework_id
    LEFT JOIN bayanat.gov_compliance_assessments   a ON a.req_id       = r.req_id
    ${includeInactive ? sql`` : sql`WHERE f.is_applicable_indicator = true`}
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

export async function updateFrameworkApplicability(frameworkId: number, isApplicable: boolean, userId: string): Promise<void> {
  await sql`UPDATE bayanat.gov_compliance_frameworks SET is_applicable_indicator = ${isApplicable} WHERE framework_id = ${frameworkId}`;
  await logUpdate("GOV_COMPLIANCE_FRAMEWORKS", frameworkId, userId, [
    { field: "is_applicable_indicator", oldVal: null, newVal: String(isApplicable), force: true },
  ]);
}

// ── Requirements ─────────────────────────────────────────────────────────────

// Derives a compliance requirement's review status from the standard workflow
// engine (asset_requests + workflow_stage_history), given the set of
// review_request_id values pulled from gov_compliance_requirements. Batched
// (not per-row) to avoid N+1 — mirrors the fetch-then-merge-in-JS pattern
// lib/queries/workflow.ts's listWorkflows() already uses.
type ReviewStatusRow = {
  requestId: number; requestStatus: string;
  confirmedAt: string | null; endorsedAt: string | null; endorsedByName: string | null;
};

async function fetchReviewStatuses(requestIds: number[]): Promise<Map<number, ReviewStatusRow>> {
  if (requestIds.length === 0) return new Map();
  const rows = await sql<ReviewStatusRow[]>`
    SELECT
      ar.request_id AS "requestId",
      ar.status_code AS "requestStatus",
      confirm.completed_at::text AS "confirmedAt",
      endorse.completed_at::text AS "endorsedAt",
      endorse_user.full_name AS "endorsedByName"
    FROM bayanat.asset_requests ar
    LEFT JOIN bayanat.workflow_instances wi ON wi.request_id = ar.request_id
    LEFT JOIN LATERAL (
      SELECT h.completed_at FROM bayanat.workflow_stage_history h
      JOIN bayanat.workflow_stages s ON s.stage_id = h.stage_id
      WHERE h.instance_id = wi.instance_id AND s.stage_order = 1
      LIMIT 1
    ) confirm ON true
    LEFT JOIN LATERAL (
      SELECT h.completed_at, h.completed_by_user_id FROM bayanat.workflow_stage_history h
      JOIN bayanat.workflow_stages s ON s.stage_id = h.stage_id
      WHERE h.instance_id = wi.instance_id AND s.stage_order = 2
      LIMIT 1
    ) endorse ON true
    LEFT JOIN bayanat.users endorse_user ON endorse_user.user_id = endorse.completed_by_user_id
    WHERE ar.request_id = ANY(${requestIds})
  `;
  return new Map(rows.map((r) => [r.requestId, r]));
}

function deriveWorkflowStatus(row: ReviewStatusRow | undefined): string {
  if (!row) return "DRAFT";
  if (row.requestStatus === "CLOSED") return "REJECTED";
  if (row.requestStatus === "RESOLVED") return "ENDORSED";
  if (row.confirmedAt) return "CONFIRMED";
  return "SUBMITTED";
}

export async function listRequirements(frameworkId: number): Promise<ComplianceRequirement[]> {
  const rows = await sql<(ComplianceRequirement & { reviewRequestId: number | null })[]>`
    SELECT
      r.req_id                  AS "reqId",
      r.framework_id            AS "frameworkId",
      r.req_code                AS "reqCode",
      r.standard,
      r.standard_code           AS "standardCode",
      r.standard_ar             AS "standardAr",
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
      r.question_en             AS "questionEn",
      r.supporting_evidence_en  AS "supportingEvidenceEn",
      r.admission_criteria_en   AS "admissionCriteriaEn",
      r.management_sector_en    AS "managementSectorEn",
      r.domain_en               AS "domainEn",
      r.directory_type_en       AS "directoryTypeEn",
      COALESCE(a.submission_status, 'NOT_COMPLETE') AS "submissionStatus",
      a.evident_admin_override  AS "evidentAdminOverride",
      a.domain_owner_override   AS "domainOwnerOverride",
      a.supporting_evidence_override AS "supportingEvidenceOverride",
      a.management_notes        AS "managementNotes",
      a.comments,
      a.evidence_name           AS "evidenceName",
      a.assessed_by             AS "assessedBy",
      a.assessed_at::text       AS "assessedAt",
      r.review_request_id       AS "reviewRequestId"
    FROM bayanat.gov_compliance_requirements r
    LEFT JOIN bayanat.gov_compliance_assessments a ON a.req_id = r.req_id
    WHERE r.framework_id = ${frameworkId}
    ORDER BY r.sort_order, r.req_code
  `;

  const reviewIds = rows.map((r) => r.reviewRequestId).filter((id): id is number => id != null);
  const statuses = await fetchReviewStatuses(reviewIds);

  return rows.map(({ reviewRequestId, ...r }) => {
    const status = reviewRequestId != null ? statuses.get(reviewRequestId) : undefined;
    return {
      ...r,
      workflowStatus: deriveWorkflowStatus(status),
      endorsedBy: status?.endorsedByName ?? null,
      endorsedAt: status?.endorsedAt ?? null,
    };
  });
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
  questionEn?: string | null;
  supportingEvidenceEn?: string | null;
  admissionCriteriaEn?: string | null;
  managementSectorEn?: string | null;
  directoryTypeEn?: string | null;
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
      management_sector      = COALESCE(${fields.managementSector      ?? null}, management_sector),
      question_en            = ${fields.questionEn            !== undefined ? (fields.questionEn            ?? null) : sql`question_en`},
      supporting_evidence_en = ${fields.supportingEvidenceEn  !== undefined ? (fields.supportingEvidenceEn  ?? null) : sql`supporting_evidence_en`},
      admission_criteria_en  = ${fields.admissionCriteriaEn   !== undefined ? (fields.admissionCriteriaEn   ?? null) : sql`admission_criteria_en`},
      management_sector_en   = ${fields.managementSectorEn    !== undefined ? (fields.managementSectorEn    ?? null) : sql`management_sector_en`},
      directory_type_en      = ${fields.directoryTypeEn       !== undefined ? (fields.directoryTypeEn       ?? null) : sql`directory_type_en`}
    WHERE req_id = ${reqId}
  `;
}

// ── Assessment ───────────────────────────────────────────────────────────────

export async function upsertAssessment(reqId: number, fields: {
  submissionStatus?: string;
  evidentAdminOverride?: string | null;
  domainOwnerOverride?: string | null;
  supportingEvidenceOverride?: string | null;
  managementNotes?: string | null;
  comments?: string | null;
  assessedBy: string;
  assessedByName?: string;
}): Promise<void> {
  const existing = await sql<{
    submission_status: string;
    evident_admin_override: string | null;
    domain_owner_override: string | null;
    supporting_evidence_override: string | null;
    management_notes: string | null;
    comments: string | null;
  }[]>`
    SELECT submission_status, evident_admin_override, domain_owner_override, supporting_evidence_override, management_notes, comments
    FROM bayanat.gov_compliance_assessments WHERE req_id = ${reqId}
  `;
  const prev = existing[0] ?? null;

  await sql`
    INSERT INTO bayanat.gov_compliance_assessments
      (req_id, submission_status, evident_admin_override, domain_owner_override, supporting_evidence_override, management_notes, comments, assessed_by, assessed_at)
    VALUES (
      ${reqId},
      ${fields.submissionStatus ?? 'NOT_COMPLETE'},
      ${fields.evidentAdminOverride ?? null},
      ${fields.domainOwnerOverride  ?? null},
      ${fields.supportingEvidenceOverride ?? null},
      ${fields.managementNotes      ?? null},
      ${fields.comments             ?? null},
      ${fields.assessedBy},
      NOW()
    )
    ON CONFLICT (req_id) DO UPDATE SET
      submission_status      = COALESCE(EXCLUDED.submission_status, gov_compliance_assessments.submission_status),
      evident_admin_override = EXCLUDED.evident_admin_override,
      domain_owner_override  = EXCLUDED.domain_owner_override,
      supporting_evidence_override = EXCLUDED.supporting_evidence_override,
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
    { field: "supportingEvidenceOverride", old: prev?.supporting_evidence_override ?? null, nw: fields.supportingEvidenceOverride ?? null },
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
  await sql`
    DELETE FROM bayanat.gov_compliance_assessments
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId} AND standard = ${standardCode}
    )
  `;
  await sql`
    UPDATE bayanat.gov_compliance_requirements
    SET review_request_id = NULL
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId} AND standard = ${standardCode}
    )
  `;
}

// Clear assessments only for levels strictly above keepUpToLevel
export async function clearAssessmentsAboveLevel(
  frameworkId: number,
  standardCode: string,
  keepUpToLevel: number
): Promise<void> {
  await sql`
    DELETE FROM bayanat.gov_compliance_assessments
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId}
        AND standard    = ${standardCode}
        AND CAST(COALESCE(NULLIF(SUBSTRING(COALESCE(maturity_level,'') FROM '[0-9]+'), ''), '0') AS INTEGER)
            > ${keepUpToLevel}
    )
  `;
  await sql`
    UPDATE bayanat.gov_compliance_requirements
    SET review_request_id = NULL
    WHERE req_id IN (
      SELECT req_id FROM bayanat.gov_compliance_requirements
      WHERE framework_id = ${frameworkId}
        AND standard    = ${standardCode}
        AND CAST(COALESCE(NULLIF(SUBSTRING(COALESCE(maturity_level,'') FROM '[0-9]+'), ''), '0') AS INTEGER)
            > ${keepUpToLevel}
    )
  `;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export type ComplianceWorkflowStatus = {
  requestId: number;
  status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "ENDORSED" | "REJECTED";
  currentStageOrder: number | null;
  endorsedBy: string | null;
  endorsedAt: string | null;
};

// Reads compliance review status straight off the standard workflow engine
// (asset_requests + workflow_instances + workflow_stage_history) via the
// requirement's review_request_id — see 087_compliance_review_workflow.sql.
export async function getComplianceWorkflowStatus(reqId: number): Promise<ComplianceWorkflowStatus | null> {
  const [req] = await sql<{ reviewRequestId: number | null }[]>`
    SELECT review_request_id AS "reviewRequestId" FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId}
  `;
  if (!req?.reviewRequestId) return null; // DRAFT — never submitted

  const [row] = await sql<{
    requestStatus: string; currentStageOrder: number | null;
  }[]>`
    SELECT ar.status_code AS "requestStatus", ws.stage_order AS "currentStageOrder"
    FROM bayanat.asset_requests ar
    LEFT JOIN bayanat.workflow_instances wi ON wi.request_id = ar.request_id AND wi.status_code = 'ACTIVE'
    LEFT JOIN bayanat.workflow_stages ws ON ws.stage_id = wi.current_stage_id
    WHERE ar.request_id = ${req.reviewRequestId}
  `;
  if (!row) return null;

  const statuses = await fetchReviewStatuses([req.reviewRequestId]);
  const s = statuses.get(req.reviewRequestId);

  return {
    requestId: req.reviewRequestId,
    status: deriveWorkflowStatus(s) as ComplianceWorkflowStatus["status"],
    currentStageOrder: row.currentStageOrder,
    endorsedBy: s?.endorsedByName ?? null,
    endorsedAt: s?.endorsedAt ?? null,
  };
}

// Submits a requirement for review — creates a real asset_requests row
// (request_type_code='COMPLIANCE_REVIEW') and starts it through the standard
// workflow engine (startWorkflow handles a Deactive "Compliance Review"
// workflow's bypass automatically, no separate logic needed here).
export async function submitComplianceReview(reqId: number, byUserId: string): Promise<{ requestId: number }> {
  const [existing] = await sql<{ reviewRequestId: number | null }[]>`
    SELECT review_request_id AS "reviewRequestId" FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId}
  `;
  if (existing?.reviewRequestId) {
    const [ar] = await sql<{ statusCode: string }[]>`
      SELECT status_code AS "statusCode" FROM bayanat.asset_requests WHERE request_id = ${existing.reviewRequestId}
    `;
    if (ar && ar.statusCode !== "CLOSED") {
      throw new Error("Already submitted — cannot resubmit an active or resolved review");
    }
  }

  const [reqRow] = await sql<{ reqCode: string; domain: string | null }[]>`
    SELECT req_code AS "reqCode", domain FROM bayanat.gov_compliance_requirements WHERE req_id = ${reqId}
  `;
  if (!reqRow) throw new Error("Requirement not found");
  const title = `Compliance review: ${reqRow.reqCode}${reqRow.domain ? ` (${reqRow.domain})` : ""}`;

  const [created] = await sql<{ requestId: number }[]>`
    INSERT INTO bayanat.asset_requests (request_type_code, title, priority_code, raised_by_user_id)
    VALUES ('COMPLIANCE_REVIEW', ${title}, 'MEDIUM', ${byUserId})
    RETURNING request_id AS "requestId"
  `;
  await sql`
    INSERT INTO bayanat.asset_request_targets (request_id, asset_type_code, asset_id, asset_name)
    VALUES (${created.requestId}, 'COMPLIANCE_REQUIREMENT', ${reqId}, ${reqRow.reqCode})
  `;
  await sql`UPDATE bayanat.gov_compliance_requirements SET review_request_id = ${created.requestId} WHERE req_id = ${reqId}`;

  await startWorkflow(created.requestId, "COMPLIANCE_REVIEW", title);
  return { requestId: created.requestId };
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
      config_id      AS "configId",
      framework_id   AS "frameworkId",
      level_num      AS "levelNum",
      name,
      color_hex      AS "colorHex",
      description,
      name_ar        AS "nameAr",
      description_ar AS "descriptionAr",
      range_from     AS "rangeFrom",
      range_to       AS "rangeTo"
    FROM bayanat.gov_compliance_level_config
    WHERE framework_id = ${frameworkId}
    ORDER BY level_num
  `;
  const defaults = [
    { name: "No Capability", colorHex: "#D84848", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
    { name: "Build",         colorHex: "#E88030", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
    { name: "Definition",    colorHex: "#2D4AA0", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
    { name: "Activation",    colorHex: "#3D7EC8", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
    { name: "Managed",       colorHex: "#1E8C76", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
    { name: "Innovation",    colorHex: "#5CA85C", description: "", nameAr: null, descriptionAr: null, rangeFrom: null, rangeTo: null },
  ];
  return Array.from({ length: 6 }, (_, i) => {
    const existing = rows.find((r) => r.levelNum === i);
    return existing ?? { configId: 0, frameworkId, levelNum: i, ...defaults[i] };
  });
}

export async function saveLevelConfig(
  frameworkId: number,
  levels: Array<{
    levelNum: number; name: string; colorHex: string;
    description: string | null; nameAr: string | null; descriptionAr: string | null;
    rangeFrom?: number | null; rangeTo?: number | null;
  }>
): Promise<void> {
  for (const l of levels) {
    await sql`
      INSERT INTO bayanat.gov_compliance_level_config
        (framework_id, level_num, name, color_hex, description, name_ar, description_ar, range_from, range_to)
      VALUES (${frameworkId}, ${l.levelNum}, ${l.name}, ${l.colorHex}, ${l.description ?? null},
              ${l.nameAr ?? null}, ${l.descriptionAr ?? null}, ${l.rangeFrom ?? null}, ${l.rangeTo ?? null})
      ON CONFLICT (framework_id, level_num) DO UPDATE SET
        name           = EXCLUDED.name,
        color_hex      = EXCLUDED.color_hex,
        description    = EXCLUDED.description,
        name_ar        = EXCLUDED.name_ar,
        description_ar = EXCLUDED.description_ar,
        range_from     = EXCLUDED.range_from,
        range_to       = EXCLUDED.range_to
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

// ── Domain configuration ──────────────────────────────────────────────────────

export type DomainConfig = {
  configId:      number;
  frameworkId:   number;
  domainCode:    string;
  nameEn:        string;
  nameAr:        string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder:     number;
  weight:        number | null;
};

export async function listDomainConfig(frameworkId: number): Promise<DomainConfig[]> {
  return sql<DomainConfig[]>`
    SELECT
      config_id      AS "configId",
      framework_id   AS "frameworkId",
      domain_code    AS "domainCode",
      name_en        AS "nameEn",
      name_ar        AS "nameAr",
      description_en AS "descriptionEn",
      description_ar AS "descriptionAr",
      sort_order     AS "sortOrder",
      weight
    FROM bayanat.gov_compliance_domain_config
    WHERE framework_id = ${frameworkId}
    ORDER BY sort_order, domain_code
  `;
}

export async function upsertDomainConfig(frameworkId: number, cfg: {
  domainCode: string; nameEn: string; nameAr?: string | null;
  descriptionEn?: string | null; descriptionAr?: string | null;
  sortOrder?: number; weight?: number | null;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_compliance_domain_config
      (framework_id, domain_code, name_en, name_ar, description_en, description_ar, sort_order, weight)
    VALUES (
      ${frameworkId}, ${cfg.domainCode}, ${cfg.nameEn},
      ${cfg.nameAr ?? null}, ${cfg.descriptionEn ?? null}, ${cfg.descriptionAr ?? null},
      ${cfg.sortOrder ?? 0}, ${cfg.weight ?? null}
    )
    ON CONFLICT (framework_id, domain_code) DO UPDATE SET
      name_en        = EXCLUDED.name_en,
      name_ar        = EXCLUDED.name_ar,
      description_en = EXCLUDED.description_en,
      description_ar = EXCLUDED.description_ar,
      sort_order     = EXCLUDED.sort_order,
      weight         = EXCLUDED.weight
    RETURNING config_id AS id
  `;
  return rows[0].id;
}

export async function deleteDomainConfig(configId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_compliance_domain_config WHERE config_id = ${configId}`;
}
