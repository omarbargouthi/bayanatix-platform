import { sql } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DsaSummary = {
  dsaId:                    number;
  dsaReferenceCode:         string | null;
  titleText:                string;
  sharingScopeCode:         string;
  directionCode:            string;
  counterpartyNameText:     string | null;
  purposeText:              string | null;
  effectiveStartDate:       string | null;
  effectiveEndDate:         string | null;
  maxClassificationCode:    string | null;
  containsPersonalData:     boolean;
  statusCode:               string;
  createdByName:            string | null;
  createdAt:                string;
  updatedAt:                string;
  datasetCount:             number;
};

export type DsaDetail = DsaSummary & {
  legalBasisText:           string | null;
  sharingFrequencyCode:     string | null;
  sharingMethodCode:        string | null;
  dataFormatCode:           string | null;
  entityRoleCode:           string | null;
  isCrossBorder:            boolean;
  fromDepartmentText:       string | null;
  toDepartmentText:         string | null;
  securityControlsText:     string | null;
  storageConditionsText:    string | null;
  destructionMechanismText: string | null;
  liabilityTermsText:       string | null;
  reviewTermsText:          string | null;
  knownDqIssuesJson:        unknown;
  riskAssessmentRef:        string | null;
  signedDocumentRef:        string | null;
  parentDsaId:              number | null;
  counterpartyContactJson:  unknown;
  submittedAt:              string | null;
  approvedAt:               string | null;
  activatedAt:              string | null;
};

export type DsaDataset = {
  dsaDatasetId:            number;
  dsaId:                   number;
  datasetDirection:        string;         // OUTBOUND | INBOUND
  entityId:                number | null;  // null for inbound before catalog assignment
  entityName:              string | null;
  schemaName:              string | null;
  sourceName:              string | null;
  inboundNameText:         string | null;
  inboundDescriptionText:  string | null;
  inboundEntityId:         number | null;
  inboundEntityName:       string | null;
  filterCriteriaText:      string | null;
  attributeCount:          number;
};

export type DsaAttribute = {
  dsaAttributeId:              number;
  dsaDatasetId:                number;
  attributeId:                 number;
  physicalName:                string;
  friendlyName:                string | null;
  dataType:                    string | null;
  classificationCodeSnapshot:  string | null;
  isPersonalData:              boolean;
  piCategoryCode:              string | null;
  treatmentCode:               string;
  treatmentNotesText:          string | null;
  // Live classification (for display before submission)
  liveClassCode:               string | null;
  liveIsPii:                   boolean;
};

export type DsaApproval = {
  approvalId:             number;
  dsaId:                  number;
  stationCode:            string;
  stationOrder:           number;
  requiredIndicator:      boolean;
  approverUserId:         string | null;
  approverName:           string | null;
  decisionCode:           string;
  decisionTimestamp:      string | null;
  commentsText:           string | null;
  delegationEvidenceRef:  string | null;
};

export type DsaAuthorization = {
  authorizationId:      number;
  dsaId:                number;
  controllerNameText:   string;
  scopeText:            string | null;
  evidenceDocumentRef:  string;
  issuedDate:           string | null;
  validUntilDate:       string | null;
  verifiedByUserId:     string | null;
  verifiedByName:       string | null;
  verifiedAt:           string | null;
};

// ── List DSAs ─────────────────────────────────────────────────────────────────

export async function listDsas(opts: {
  status?: string;
  scope?: string;
  search?: string;
  page?: number;
  limit?: number;
  userId?: string;
  userRole?: string;
}): Promise<{ data: DsaSummary[]; total: number }> {
  const { search = "", page = 1, limit = 20, userId, userRole } = opts;
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const scope  = opts.scope  && opts.scope  !== "all" ? opts.scope  : null;
  const like   = "%" + search + "%";
  const offset = (page - 1) * limit;

  type Row = DsaSummary & { total: number };

  const rows = await sql<Row[]>`
    SELECT
      d.dsa_id                                                  AS "dsaId",
      d.dsa_reference_code                                      AS "dsaReferenceCode",
      d.title_text                                              AS "titleText",
      d.sharing_scope_code                                      AS "sharingScopeCode",
      d.direction_code                                          AS "directionCode",
      d.counterparty_name_text                                  AS "counterpartyNameText",
      d.purpose_text                                            AS "purposeText",
      to_char(d.effective_start_date, 'YYYY-MM-DD')             AS "effectiveStartDate",
      to_char(d.effective_end_date,   'YYYY-MM-DD')             AS "effectiveEndDate",
      d.max_classification_code                                 AS "maxClassificationCode",
      d.contains_personal_data_indicator                        AS "containsPersonalData",
      d.status_code                                             AS "statusCode",
      u.full_name                                               AS "createdByName",
      to_char(d.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')      AS "createdAt",
      to_char(d.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')      AS "updatedAt",
      COUNT(DISTINCT ds.dsa_dataset_id)::int                    AS "datasetCount",
      COUNT(*) OVER()::int                                      AS total
    FROM bayanat.data_sharing_agreements d
    LEFT JOIN bayanat.users     u  ON u.user_id = d.created_by
    LEFT JOIN bayanat.dsa_datasets ds ON ds.dsa_id = d.dsa_id
    WHERE
      ${status != null ? sql`d.status_code = ${status}` : sql`true`}
      AND ${scope != null ? sql`d.sharing_scope_code = ${scope}` : sql`true`}
      AND ${search !== ""
        ? sql`d.title_text ILIKE ${like} OR d.counterparty_name_text ILIKE ${like} OR d.dsa_reference_code ILIKE ${like}`
        : sql`true`}
    GROUP BY d.dsa_id, u.full_name
    ORDER BY d.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = Number(rows[0]?.total ?? 0);
  return {
    data: rows.map(({ total: _t, ...r }) => ({
      ...r,
      dsaId:        Number(r.dsaId),
      datasetCount: Number(r.datasetCount ?? 0),
    })) as DsaSummary[],
    total,
  };
}

// ── Get single DSA ────────────────────────────────────────────────────────────

export async function getDsa(dsaId: number): Promise<DsaDetail | null> {
  const rows = await sql<DsaDetail[]>`
    SELECT
      d.dsa_id                                                  AS "dsaId",
      d.dsa_reference_code                                      AS "dsaReferenceCode",
      d.title_text                                              AS "titleText",
      d.sharing_scope_code                                      AS "sharingScopeCode",
      d.direction_code                                          AS "directionCode",
      d.counterparty_name_text                                  AS "counterpartyNameText",
      d.counterparty_contact_json                               AS "counterpartyContactJson",
      d.purpose_text                                            AS "purposeText",
      d.legal_basis_text                                        AS "legalBasisText",
      to_char(d.effective_start_date, 'YYYY-MM-DD')             AS "effectiveStartDate",
      to_char(d.effective_end_date,   'YYYY-MM-DD')             AS "effectiveEndDate",
      d.sharing_frequency_code                                  AS "sharingFrequencyCode",
      d.sharing_method_code                                     AS "sharingMethodCode",
      d.data_format_code                                        AS "dataFormatCode",
      d.max_classification_code                                 AS "maxClassificationCode",
      d.contains_personal_data_indicator                        AS "containsPersonalData",
      d.entity_role_code                                        AS "entityRoleCode",
      d.is_cross_border                                         AS "isCrossBorder",
      d.from_department_text                                    AS "fromDepartmentText",
      d.to_department_text                                      AS "toDepartmentText",
      d.security_controls_text                                  AS "securityControlsText",
      d.storage_conditions_text                                 AS "storageConditionsText",
      d.destruction_mechanism_text                              AS "destructionMechanismText",
      d.liability_terms_text                                    AS "liabilityTermsText",
      d.review_terms_text                                       AS "reviewTermsText",
      d.known_dq_issues_json                                    AS "knownDqIssuesJson",
      d.risk_assessment_ref                                     AS "riskAssessmentRef",
      d.status_code                                             AS "statusCode",
      d.signed_document_ref                                     AS "signedDocumentRef",
      d.parent_dsa_id                                           AS "parentDsaId",
      u.full_name                                               AS "createdByName",
      to_char(d.created_at,    'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
      to_char(d.updated_at,    'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "updatedAt",
      to_char(d.submitted_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "submittedAt",
      to_char(d.approved_at,   'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "approvedAt",
      to_char(d.activated_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "activatedAt",
      0::int                                                    AS "datasetCount"
    FROM bayanat.data_sharing_agreements d
    LEFT JOIN bayanat.users u ON u.user_id = d.created_by
    WHERE d.dsa_id = ${dsaId}
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, dsaId: Number(r.dsaId), datasetCount: 0 };
}

// ── DSA datasets + attributes ─────────────────────────────────────────────────

export async function getDsaDatasets(dsaId: number): Promise<DsaDataset[]> {
  const rows = await sql<DsaDataset[]>`
    SELECT
      dd.dsa_dataset_id                           AS "dsaDatasetId",
      dd.dsa_id                                   AS "dsaId",
      dd.dataset_direction                        AS "datasetDirection",
      dd.entity_id                                AS "entityId",
      e.entity_name_text                          AS "entityName",
      s.schema_name_text                          AS "schemaName",
      COALESCE(src.source_name_text, '')          AS "sourceName",
      dd.inbound_name_text                        AS "inboundNameText",
      dd.inbound_description_text                 AS "inboundDescriptionText",
      dd.inbound_entity_id                        AS "inboundEntityId",
      ie.entity_name_text                         AS "inboundEntityName",
      dd.filter_criteria_text                     AS "filterCriteriaText",
      COUNT(da.dsa_attribute_id)::int             AS "attributeCount"
    FROM bayanat.dsa_datasets dd
    LEFT JOIN bayanat.data_entities  e   ON e.entity_id   = dd.entity_id
    LEFT JOIN bayanat.data_schemas   s   ON s.schema_id   = e.schema_id
    LEFT JOIN bayanat.data_sources src   ON src.data_source_id = s.data_source_id
    LEFT JOIN bayanat.data_entities  ie  ON ie.entity_id  = dd.inbound_entity_id
    LEFT JOIN bayanat.dsa_attributes da  ON da.dsa_dataset_id = dd.dsa_dataset_id
    WHERE dd.dsa_id = ${dsaId}
    GROUP BY dd.dsa_dataset_id, e.entity_name_text, s.schema_name_text,
             src.source_name_text, ie.entity_name_text
    ORDER BY dd.dataset_direction DESC, dd.dsa_dataset_id
  `;
  return rows.map(r => ({
    ...r,
    dsaDatasetId:   Number(r.dsaDatasetId),
    dsaId:          Number(r.dsaId),
    entityId:       r.entityId != null ? Number(r.entityId) : null,
    inboundEntityId: r.inboundEntityId != null ? Number(r.inboundEntityId) : null,
    attributeCount: Number(r.attributeCount ?? 0),
  }));
}

export async function getDsaAttributes(dsaDatasetId: number): Promise<DsaAttribute[]> {
  const rows = await sql<DsaAttribute[]>`
    SELECT
      da.dsa_attribute_id                         AS "dsaAttributeId",
      da.dsa_dataset_id                           AS "dsaDatasetId",
      da.attribute_id                             AS "attributeId",
      a.physical_name_text                        AS "physicalName",
      a.friendly_name_text                        AS "friendlyName",
      a.data_type_text                            AS "dataType",
      da.classification_code_snapshot             AS "classificationCodeSnapshot",
      da.is_personal_data_indicator               AS "isPersonalData",
      da.pi_category_code                         AS "piCategoryCode",
      da.treatment_code                           AS "treatmentCode",
      da.treatment_notes_text                     AS "treatmentNotesText",
      ct.class_code                               AS "liveClassCode",
      COALESCE(bg.is_pii_indicator, false)        AS "liveIsPii"
    FROM bayanat.dsa_attributes da
    JOIN bayanat.data_attributes a ON a.attribute_id = da.attribute_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = da.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    LEFT JOIN bayanat.classification_types ct ON ct.class_code = bg.classification_code
    WHERE da.dsa_dataset_id = ${dsaDatasetId}
    ORDER BY a.physical_name_text
  `;
  return rows.map(r => ({ ...r, dsaAttributeId: Number(r.dsaAttributeId), dsaDatasetId: Number(r.dsaDatasetId), attributeId: Number(r.attributeId) }));
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getDsaApprovals(dsaId: number): Promise<DsaApproval[]> {
  const rows = await sql<DsaApproval[]>`
    SELECT
      a.approval_id                               AS "approvalId",
      a.dsa_id                                    AS "dsaId",
      a.station_code                              AS "stationCode",
      a.station_order                             AS "stationOrder",
      a.required_indicator                        AS "requiredIndicator",
      a.approver_user_id                          AS "approverUserId",
      u.full_name                                 AS "approverName",
      a.decision_code                             AS "decisionCode",
      to_char(a.decision_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "decisionTimestamp",
      a.comments_text                             AS "commentsText",
      a.delegation_evidence_ref                   AS "delegationEvidenceRef"
    FROM bayanat.dsa_approvals a
    LEFT JOIN bayanat.users u ON u.user_id = a.approver_user_id
    WHERE a.dsa_id = ${dsaId}
    ORDER BY a.station_order
  `;
  return rows.map(r => ({ ...r, approvalId: Number(r.approvalId), dsaId: Number(r.dsaId), stationOrder: Number(r.stationOrder) }));
}

// ── Authorizations ────────────────────────────────────────────────────────────

export async function getDsaAuthorizations(dsaId: number): Promise<DsaAuthorization[]> {
  const rows = await sql<DsaAuthorization[]>`
    SELECT
      a.authorization_id                          AS "authorizationId",
      a.dsa_id                                    AS "dsaId",
      a.controller_name_text                      AS "controllerNameText",
      a.scope_text                                AS "scopeText",
      a.evidence_document_ref                     AS "evidenceDocumentRef",
      to_char(a.issued_date,     'YYYY-MM-DD')    AS "issuedDate",
      to_char(a.valid_until_date,'YYYY-MM-DD')    AS "validUntilDate",
      a.verified_by_user_id                       AS "verifiedByUserId",
      u.full_name                                 AS "verifiedByName",
      to_char(a.verified_at,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "verifiedAt"
    FROM bayanat.dsa_authorizations a
    LEFT JOIN bayanat.users u ON u.user_id = a.verified_by_user_id
    WHERE a.dsa_id = ${dsaId}
    ORDER BY a.authorization_id
  `;
  return rows.map(r => ({ ...r, authorizationId: Number(r.authorizationId), dsaId: Number(r.dsaId) }));
}
