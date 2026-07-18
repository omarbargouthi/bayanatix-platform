import { sql } from "@/lib/db";

// ── Summary row for the officer queue ────────────────────────────────────────
export type FoiRequestSummary = {
  foiRequestId:          number;
  referenceCode:         string;
  subjectText:           string;
  requesterName:         string;
  requesterEmail:        string;
  statusCode:            string;
  channelCode:           string;
  domainCode:            string | null;
  submittedAt:           string;
  firstResponseDueDate:  string | null;
  clockPausedDays:       number;
  assignedOfficerUserId: string | null;
  assignedOfficerName:   string | null;
  fulfillmentStageCode:  string | null;
  slaBusinessDaysLeft:   number | null;
  closedAt:              string | null;
};

export async function listFoiRequests(params: {
  status?: string;
  search?: string;
  page: number;
  limit: number;
}): Promise<{ rows: FoiRequestSummary[]; total: number }> {
  const { status, search, page, limit } = params;
  const offset = (page - 1) * limit;

  const rows = await sql<FoiRequestSummary[]>`
    SELECT
      r.foi_request_id         AS "foiRequestId",
      r.reference_code         AS "referenceCode",
      r.subject_text           AS "subjectText",
      rq.full_name_text        AS "requesterName",
      rq.email_text            AS "requesterEmail",
      r.status_code            AS "statusCode",
      r.channel_code           AS "channelCode",
      r.domain_code            AS "domainCode",
      r.submitted_at           AS "submittedAt",
      r.first_response_due_date AS "firstResponseDueDate",
      r.clock_paused_days      AS "clockPausedDays",
      r.assigned_officer_user_id AS "assignedOfficerUserId",
      u.full_name              AS "assignedOfficerName",
      r.fulfillment_stage_code AS "fulfillmentStageCode",
      r.closed_at              AS "closedAt",
      CASE
        WHEN r.status_code IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED') THEN NULL
        WHEN r.first_response_due_date IS NULL THEN NULL
        ELSE bayanat.ksa_business_days(CURRENT_DATE, r.first_response_due_date) - r.clock_paused_days
      END                      AS "slaBusinessDaysLeft"
    FROM bayanat.foi_requests r
    JOIN bayanat.foi_requesters rq ON rq.requester_id = r.requester_id
    LEFT JOIN bayanat.users u ON u.user_id = r.assigned_officer_user_id
    WHERE
      (${status ?? null}::TEXT IS NULL OR r.status_code = ${status ?? null}::TEXT
        OR (${status ?? null} = 'ACTIVE' AND r.status_code NOT IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED'))
      )
      AND (${search ?? null}::TEXT IS NULL
        OR r.reference_code ILIKE ${'%' + (search ?? '') + '%'}
        OR r.subject_text ILIKE ${'%' + (search ?? '') + '%'}
        OR rq.full_name_text ILIKE ${'%' + (search ?? '') + '%'}
      )
    ORDER BY
      CASE WHEN r.status_code IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED') THEN 1 ELSE 0 END,
      r.submitted_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::INT AS count
    FROM bayanat.foi_requests r
    JOIN bayanat.foi_requesters rq ON rq.requester_id = r.requester_id
    WHERE
      (${status ?? null}::TEXT IS NULL OR r.status_code = ${status ?? null}::TEXT
        OR (${status ?? null} = 'ACTIVE' AND r.status_code NOT IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED'))
      )
      AND (${search ?? null}::TEXT IS NULL
        OR r.reference_code ILIKE ${'%' + (search ?? '') + '%'}
        OR r.subject_text ILIKE ${'%' + (search ?? '') + '%'}
        OR rq.full_name_text ILIKE ${'%' + (search ?? '') + '%'}
      )
  `;

  return { rows, total: count };
}

// ── Full case detail ──────────────────────────────────────────────────────────
export type FoiCaseDetail = {
  foiRequestId:              number;
  referenceCode:             string;
  subjectText:               string;
  descriptionText:           string;
  statusCode:                string;
  channelCode:               string;
  domainCode:                string | null;
  domainName:                string | null;
  requestedFormatCode:       string;
  assignedOfficerUserId:     string | null;
  assignedOfficerName:       string | null;
  rejectionGroundCode:       string | null;
  rejectionGroundName:       string | null;
  rejectionJustificationText: string | null;
  deliveryReference:         string | null;
  submittedAt:               string;
  firstResponseDueDate:      string | null;
  clockPausedDays:           number;
  closedAt:                  string | null;
  fulfillmentStageCode:      string | null;
  slaBusinessDaysLeft:       number | null;
  // requester
  requesterId:               number;
  requesterTypeCode:         string;
  requesterName:             string;
  requesterEmail:            string;
  requesterPhone:            string | null;
  requesterNationalId:       string | null;
  requesterLanguage:         string;
  // assessment (nullable)
  assessmentId:              number | null;
  eligibilityCode:           string | null;
  complexityCode:            string | null;
  estimatedColumns:          number | null;
  estimatedSources:          number | null;
  estimatedEffortDays:       number | null;
  alreadyPublicLink:         string | null;
  assessmentNotes:           string | null;
  // latest quote (nullable)
  quoteId:                   number | null;
  quotedAmount:              number | null;
  dailyRateSar:              number | null;
  breakdownJson:             Record<string, unknown> | null;
  estimatedDeliveryDays:     number | null;
  validUntilDate:            string | null;
  quoteStatusCode:           string | null;
  quoteDecisionAt:           string | null;
};

export async function getFoiCase(foiRequestId: number): Promise<FoiCaseDetail | null> {
  const [row] = await sql<FoiCaseDetail[]>`
    SELECT
      r.foi_request_id           AS "foiRequestId",
      r.reference_code           AS "referenceCode",
      r.subject_text             AS "subjectText",
      r.description_text         AS "descriptionText",
      r.status_code              AS "statusCode",
      r.channel_code             AS "channelCode",
      r.domain_code              AS "domainCode",
      gd.domain_name             AS "domainName",
      r.requested_format_code    AS "requestedFormatCode",
      r.assigned_officer_user_id AS "assignedOfficerUserId",
      u.full_name                AS "assignedOfficerName",
      r.rejection_ground_code    AS "rejectionGroundCode",
      fg.ground_name_text        AS "rejectionGroundName",
      r.rejection_justification_text AS "rejectionJustificationText",
      r.delivery_reference       AS "deliveryReference",
      r.submitted_at             AS "submittedAt",
      r.first_response_due_date  AS "firstResponseDueDate",
      r.clock_paused_days        AS "clockPausedDays",
      r.closed_at                AS "closedAt",
      r.fulfillment_stage_code   AS "fulfillmentStageCode",
      CASE
        WHEN r.status_code IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED') THEN NULL
        WHEN r.first_response_due_date IS NULL THEN NULL
        ELSE bayanat.ksa_business_days(CURRENT_DATE, r.first_response_due_date) - r.clock_paused_days
      END                        AS "slaBusinessDaysLeft",
      rq.requester_id            AS "requesterId",
      rq.requester_type_code     AS "requesterTypeCode",
      rq.full_name_text          AS "requesterName",
      rq.email_text              AS "requesterEmail",
      rq.phone_text              AS "requesterPhone",
      rq.national_id_or_cr_text  AS "requesterNationalId",
      rq.preferred_language_code AS "requesterLanguage",
      a.assessment_id            AS "assessmentId",
      a.eligibility_code         AS "eligibilityCode",
      a.complexity_code          AS "complexityCode",
      a.estimated_columns_count  AS "estimatedColumns",
      a.estimated_sources_count  AS "estimatedSources",
      a.estimated_effort_days    AS "estimatedEffortDays",
      a.already_public_link_text AS "alreadyPublicLink",
      a.notes_text               AS "assessmentNotes",
      q.quote_id                 AS "quoteId",
      q.quoted_amount            AS "quotedAmount",
      q.daily_rate_sar           AS "dailyRateSar",
      q.breakdown_json           AS "breakdownJson",
      q.estimated_delivery_days  AS "estimatedDeliveryDays",
      q.valid_until_date         AS "validUntilDate",
      q.status_code              AS "quoteStatusCode",
      q.decision_at              AS "quoteDecisionAt"
    FROM bayanat.foi_requests r
    JOIN bayanat.foi_requesters rq ON rq.requester_id = r.requester_id
    LEFT JOIN bayanat.governance_domains gd ON gd.domain_code = r.domain_code
    LEFT JOIN bayanat.users u ON u.user_id = r.assigned_officer_user_id
    LEFT JOIN bayanat.foi_rejection_grounds fg ON fg.ground_code = r.rejection_ground_code
    LEFT JOIN bayanat.foi_assessments a ON a.foi_request_id = r.foi_request_id
    LEFT JOIN bayanat.foi_quotes q ON q.quote_id = (
      SELECT quote_id FROM bayanat.foi_quotes
      WHERE foi_request_id = r.foi_request_id
      ORDER BY created_at DESC LIMIT 1
    )
    WHERE r.foi_request_id = ${foiRequestId}
  `;
  return row ?? null;
}

// ── Public tracking (by access token) ────────────────────────────────────────
export type FoiTrackingView = {
  referenceCode:        string;
  subjectText:          string;
  statusCode:           string;
  submittedAt:          string;
  firstResponseDueDate: string | null;
  rejectionGroundName:  string | null;
  rejectionJustification: string | null;
  deliveryReference:    string | null;
  // quote for accept/decline
  quoteId:              number | null;
  quotedAmount:         number | null;
  estimatedDeliveryDays: number | null;
  validUntilDate:       string | null;
  quoteStatusCode:      string | null;
  breakdownJson:        Record<string, unknown> | null;
};

export async function getFoiByToken(token: string): Promise<FoiTrackingView | null> {
  const [row] = await sql<FoiTrackingView[]>`
    SELECT
      r.reference_code          AS "referenceCode",
      r.subject_text            AS "subjectText",
      r.status_code             AS "statusCode",
      r.submitted_at            AS "submittedAt",
      r.first_response_due_date AS "firstResponseDueDate",
      fg.ground_name_text       AS "rejectionGroundName",
      r.rejection_justification_text AS "rejectionJustification",
      r.delivery_reference      AS "deliveryReference",
      q.quote_id                AS "quoteId",
      q.quoted_amount           AS "quotedAmount",
      q.estimated_delivery_days AS "estimatedDeliveryDays",
      q.valid_until_date        AS "validUntilDate",
      q.status_code             AS "quoteStatusCode",
      q.breakdown_json          AS "breakdownJson"
    FROM bayanat.foi_requests r
    LEFT JOIN bayanat.foi_rejection_grounds fg ON fg.ground_code = r.rejection_ground_code
    LEFT JOIN bayanat.foi_quotes q ON q.foi_request_id = r.foi_request_id
      AND q.status_code IN ('ISSUED','ACCEPTED','DECLINED')
    WHERE r.access_token = ${token}
  `;
  return row ?? null;
}

// ── Communications for a request ─────────────────────────────────────────────
export type FoiComm = {
  commId:          number;
  directionCode:   string;
  messageTypeCode: string;
  subjectText:     string | null;
  bodyText:        string;
  sentAt:          string;
  channelCode:     string;
  senderName:      string | null;
};

export async function getFoiCommunications(foiRequestId: number): Promise<FoiComm[]> {
  return sql<FoiComm[]>`
    SELECT
      c.comm_id            AS "commId",
      c.direction_code     AS "directionCode",
      c.message_type_code  AS "messageTypeCode",
      c.subject_text       AS "subjectText",
      c.body_text          AS "bodyText",
      c.sent_at            AS "sentAt",
      c.channel_code       AS "channelCode",
      u.full_name          AS "senderName"
    FROM bayanat.foi_communications c
    LEFT JOIN bayanat.users u ON u.user_id = c.sent_by_user_id
    WHERE c.foi_request_id = ${foiRequestId}
    ORDER BY c.sent_at DESC
  `;
}

// ── Payments for a request ────────────────────────────────────────────────────
export type FoiPayment = {
  paymentId:            number;
  paymentTypeCode:      string;
  amount:               number;
  paymentReferenceText: string | null;
  receivedAt:           string;
  notesText:            string | null;
  recordedByName:       string | null;
};

export async function getFoiPayments(foiRequestId: number): Promise<FoiPayment[]> {
  return sql<FoiPayment[]>`
    SELECT
      p.payment_id              AS "paymentId",
      p.payment_type_code       AS "paymentTypeCode",
      p.amount                  AS "amount",
      p.payment_reference_text  AS "paymentReferenceText",
      p.received_at             AS "receivedAt",
      p.notes_text              AS "notesText",
      u.full_name               AS "recordedByName"
    FROM bayanat.foi_payments p
    LEFT JOIN bayanat.users u ON u.user_id = p.recorded_by_user_id
    WHERE p.foi_request_id = ${foiRequestId}
    ORDER BY p.received_at DESC
  `;
}

// ── FOI config from system_config ─────────────────────────────────────────────
export async function getFoiConfig(): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM bayanat.system_config WHERE key LIKE 'foi_%'
  `;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ── Rejection grounds list ────────────────────────────────────────────────────
export type RejectionGround = {
  groundCode:        string;
  groundNameText:    string;
  groundDescription: string | null;
};

export async function getRejectionGrounds(): Promise<RejectionGround[]> {
  return sql<RejectionGround[]>`
    SELECT
      ground_code         AS "groundCode",
      ground_name_text    AS "groundNameText",
      ground_description_text AS "groundDescription"
    FROM bayanat.foi_rejection_grounds
    WHERE is_active = TRUE
    ORDER BY ground_code
  `;
}

// ── Queue stats ───────────────────────────────────────────────────────────────
export type FoiStats = {
  total:          number;
  active:         number;
  overdue:        number;
  awaitingAction: number;
};

export async function getFoiStats(): Promise<FoiStats> {
  const [row] = await sql<FoiStats[]>`
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (
        WHERE status_code NOT IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED')
      )::INT AS active,
      COUNT(*) FILTER (
        WHERE status_code NOT IN ('CLOSED','DELIVERED','REJECTED','QUOTE_DECLINED','WITHDRAWN','APPEAL_DECIDED')
          AND first_response_due_date < CURRENT_DATE
          AND clock_paused_since IS NULL
      )::INT AS overdue,
      COUNT(*) FILTER (
        WHERE status_code IN ('SUBMITTED','TRIAGE','ASSESSMENT','QUOTE_ACCEPTED')
      )::INT AS "awaitingAction"
    FROM bayanat.foi_requests
  `;
  return row;
}
