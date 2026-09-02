import { sql } from "./db";

type StageRow = {
  stageId:        number;
  stageName:      string;
  stageOrder:     number;
  assigneeType:   "ROLE" | "TEAM" | "USER" | "REQUESTER";
  assigneeRoleId: number | null;
  assigneeTeamId: number | null;
  assigneeUserId: string | null;
  slaValue:       number | null;
  isFinal:        boolean;
};

async function resolveAssignees(stage: StageRow, requestId: number): Promise<string[]> {
  switch (stage.assigneeType) {
    case "USER":
      return stage.assigneeUserId ? [stage.assigneeUserId] : [];

    case "REQUESTER": {
      const rows = await sql<{ userId: string }[]>`
        SELECT raised_by_user_id AS "userId" FROM bayanat.asset_requests WHERE request_id = ${requestId}
      `;
      return rows[0] ? [rows[0].userId] : [];
    }

    case "TEAM": {
      if (!stage.assigneeTeamId) return [];
      const rows = await sql<{ userId: string }[]>`
        SELECT user_id AS "userId" FROM bayanat.team_members WHERE team_id = ${stage.assigneeTeamId}
      `;
      return rows.map((r) => r.userId);
    }

    case "ROLE": {
      if (!stage.assigneeRoleId) return [];
      // Whoever holds this role globally (see bayanat.role_assignments) —
      // either directly, or as a member of a team the role was assigned to.
      // Resource-scoped (schema/table) role assignments don't apply here:
      // a workflow stage isn't tied to a specific asset.
      const rows = await sql<{ userId: string }[]>`
        SELECT DISTINCT user_id AS "userId" FROM (
          SELECT ra.user_id
          FROM bayanat.role_assignments ra
          WHERE ra.role_id = ${stage.assigneeRoleId} AND ra.resource_type = 'GLOBAL' AND ra.user_id IS NOT NULL
          UNION
          SELECT tm.user_id
          FROM bayanat.role_assignments ra
          JOIN bayanat.team_members tm ON tm.team_id = ra.team_id
          WHERE ra.role_id = ${stage.assigneeRoleId} AND ra.resource_type = 'GLOBAL' AND ra.team_id IS NOT NULL
        ) x
      `;
      return rows.map((r) => r.userId);
    }

    default:
      return [];
  }
}

async function notify(userId: string, requestId: number, requestTitle: string, stageName: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.notifications
      (user_id, type, title, body, severity, action_label, action_href)
    VALUES (
      ${userId},
      'WORKFLOW',
      ${"Action required: " + stageName},
      ${"You are assigned to \"" + stageName + "\" on: " + requestTitle},
      'WARNING',
      'View Request',
      ${"/requests/" + requestId}
    )
  `;
}

async function enterStage(instanceId: number, stage: StageRow, requestId: number, requestTitle: string): Promise<void> {
  const assignees = await resolveAssignees(stage, requestId);
  if (assignees.length === 0) {
    await sql`INSERT INTO bayanat.workflow_stage_history (instance_id, stage_id) VALUES (${instanceId}, ${stage.stageId})`;
  } else {
    for (const userId of assignees) {
      await sql`
        INSERT INTO bayanat.workflow_stage_history (instance_id, stage_id, assigned_to_user_id)
        VALUES (${instanceId}, ${stage.stageId}, ${userId})
      `;
      await notify(userId, requestId, requestTitle, stage.stageName);
    }
  }
}

const STAGE_SELECT = sql`
  stage_id          AS "stageId",
  stage_name_text   AS "stageName",
  stage_order       AS "stageOrder",
  assignee_type     AS "assigneeType",
  assignee_role_id  AS "assigneeRoleId",
  assignee_team_id  AS "assigneeTeamId",
  assignee_user_id  AS "assigneeUserId",
  sla_days_count    AS "slaValue",
  is_final          AS "isFinal"
`;

export async function startWorkflow(requestId: number, requestTypeCode: string, requestTitle: string): Promise<void> {
  const [mapping] = await sql<{ workflowId: number; statusCode: string }[]>`
    SELECT rtw.workflow_id AS "workflowId", wd.status_code AS "statusCode"
    FROM bayanat.request_type_workflows rtw
    JOIN bayanat.workflow_definitions wd ON wd.workflow_id = rtw.workflow_id
    WHERE rtw.request_type_code = ${requestTypeCode}
  `;
  if (!mapping) return;

  if (mapping.statusCode === "Deactive") {
    // Bypass: no workflow_instances/workflow_stage_history row, no notifications —
    // the request is approved immediately, as if it had cleared every stage.
    await sql`UPDATE bayanat.asset_requests SET status_code = 'RESOLVED', updated_at = NOW() WHERE request_id = ${requestId}`;
    await applyApprovalOutcome(requestId, requestTypeCode, true);
    return;
  }
  // "Draft" workflows can't be assigned to a request type (enforced in
  // app/api/admin/workflows/assign/route.ts), so this path should be unreachable —
  // fall through and treat as Active defensively rather than silently no-op.

  const [first] = await sql<StageRow[]>`
    SELECT ${STAGE_SELECT} FROM bayanat.workflow_stages
    WHERE workflow_id = ${mapping.workflowId} ORDER BY stage_order ASC LIMIT 1
  `;
  if (!first) return;

  const [inst] = await sql<{ instanceId: number }[]>`
    INSERT INTO bayanat.workflow_instances (workflow_id, request_id, current_stage_id)
    VALUES (${mapping.workflowId}, ${requestId}, ${first.stageId})
    RETURNING instance_id AS "instanceId"
  `;

  await sql`UPDATE bayanat.asset_requests SET status_code = 'IN_PROGRESS', updated_at = NOW() WHERE request_id = ${requestId}`;
  await enterStage(inst.instanceId, first, requestId, requestTitle);
}

// When a workflow completes (or is bypassed via a Deactive definition), some
// request types need their target asset's own status updated — the workflow
// engine only tracks asset_requests/workflow_instances and has no generic way
// to know what "approved" means for an arbitrary asset type. Extend this
// switch when a new request type needs a side effect on approval/rejection.
async function applyApprovalOutcome(requestId: number, requestTypeCode: string, approved: boolean): Promise<void> {
  switch (requestTypeCode) {
    case "PUBLISH_OPEN_DATA":
    case "PUBLISH_OPEN_DATA_PI": {
      const [target] = await sql<{ assetId: number }[]>`
        SELECT asset_id AS "assetId" FROM bayanat.asset_request_targets
        WHERE request_id = ${requestId} AND asset_type_code = 'OPEN_DATASET' LIMIT 1
      `;
      if (!target) return;
      await sql`
        UPDATE bayanat.open_datasets
        SET status_code = ${approved ? "APPROVED" : "REJECTED"}, updated_at = NOW()
        WHERE dataset_id = ${target.assetId}
      `;
      return;
    }
    case "CLASSIFY_ASSET":
      // No-op: the classification term is applied eagerly at request-creation
      // time (see app/api/classification/assign, app/api/open-data/datasets/[id]/reclassify),
      // not on approval. The workflow is purely an audit/sign-off trail here.
      return;
    case "COMPLIANCE_REVIEW":
      // No-op: compliance workflow status is derived on read from
      // asset_requests.status_code + workflow_stage_history (see
      // getComplianceWorkflowStatus in lib/queries/gov-compliance.ts) —
      // nothing extra to persist.
      return;
    default:
      return; // FIX_DATA_ISSUE, UPDATE_DEFINITION, CERTIFY_ASSET, GRANT_ACCESS, REMOVE_ACCESS, OTHER
  }
}

export async function advanceWorkflow(
  requestId:    number,
  actorUserId:  string,
  requestTitle: string,
  outcome:      "APPROVED" | "REJECTED" | "COMPLETED",
  notes?:       string,
): Promise<{ done: boolean; nextStageName?: string }> {
  const [inst] = await sql<{
    instanceId: number; workflowId: number; currentStageId: number; stageOrder: number; isFinal: boolean; requestTypeCode: string;
  }[]>`
    SELECT wi.instance_id        AS "instanceId",
           wi.workflow_id        AS "workflowId",
           wi.current_stage_id   AS "currentStageId",
           ws.stage_order        AS "stageOrder",
           ws.is_final           AS "isFinal",
           ar.request_type_code  AS "requestTypeCode"
    FROM bayanat.workflow_instances wi
    JOIN bayanat.workflow_stages ws ON ws.stage_id = wi.current_stage_id
    JOIN bayanat.asset_requests ar ON ar.request_id = wi.request_id
    WHERE wi.request_id = ${requestId} AND wi.status_code = 'ACTIVE'
  `;
  if (!inst) throw new Error("No active workflow for this request");

  await sql`
    UPDATE bayanat.workflow_stage_history
    SET completed_at = NOW(), completed_by_user_id = ${actorUserId},
        outcome_code = ${outcome}, notes = ${notes ?? null}
    WHERE instance_id = ${inst.instanceId} AND stage_id = ${inst.currentStageId} AND completed_at IS NULL
  `;

  const finalStatus = outcome === "REJECTED" ? "CLOSED" : "RESOLVED";

  if (inst.isFinal || outcome === "REJECTED") {
    await sql`UPDATE bayanat.workflow_instances SET status_code='COMPLETED', completed_at=NOW(), current_stage_id=NULL WHERE instance_id=${inst.instanceId}`;
    await sql`UPDATE bayanat.asset_requests SET status_code=${finalStatus}, updated_at=NOW() WHERE request_id=${requestId}`;
    await applyApprovalOutcome(requestId, inst.requestTypeCode, finalStatus === "RESOLVED");
    return { done: true };
  }

  const [next] = await sql<StageRow[]>`
    SELECT ${STAGE_SELECT} FROM bayanat.workflow_stages
    WHERE workflow_id = ${inst.workflowId} AND stage_order > ${inst.stageOrder}
    ORDER BY stage_order ASC LIMIT 1
  `;

  if (!next) {
    await sql`UPDATE bayanat.workflow_instances SET status_code='COMPLETED', completed_at=NOW(), current_stage_id=NULL WHERE instance_id=${inst.instanceId}`;
    await sql`UPDATE bayanat.asset_requests SET status_code='RESOLVED', updated_at=NOW() WHERE request_id=${requestId}`;
    await applyApprovalOutcome(requestId, inst.requestTypeCode, true);
    return { done: true };
  }

  await sql`UPDATE bayanat.workflow_instances SET current_stage_id=${next.stageId} WHERE instance_id=${inst.instanceId}`;
  await enterStage(inst.instanceId, next, requestId, requestTitle);
  return { done: false, nextStageName: next.stageName };
}
