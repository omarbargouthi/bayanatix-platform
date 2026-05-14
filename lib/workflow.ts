import { sql } from "./db";

type StageRow = {
  stageId:        number;
  stageName:      string;
  stageOrder:     number;
  assigneeRole:   string;
  assigneeUserId: string | null;
  slaValue:       number | null;
  isFinal:        boolean;
};

async function resolveAssignees(stage: StageRow, requestId: number): Promise<string[]> {
  switch (stage.assigneeRole) {
    case "SPECIFIC_USER":
      return stage.assigneeUserId ? [stage.assigneeUserId] : [];

    case "REQUESTER": {
      const rows = await sql<{ userId: string }[]>`
        SELECT raised_by_user_id AS "userId" FROM bayanat.asset_requests WHERE request_id = ${requestId}
      `;
      return rows[0] ? [rows[0].userId] : [];
    }

    case "STEWARD": {
      const rows = await sql<{ userId: string }[]>`
        SELECT DISTINCT s.user_id AS "userId"
        FROM bayanat.asset_stakeholders s
        JOIN bayanat.asset_request_targets art
          ON art.asset_type_code = s.asset_type_code AND art.asset_id = s.asset_id
        WHERE art.request_id = ${requestId}
      `;
      if (rows.length > 0) return rows.map((r) => r.userId);
      const fb = await sql<{ userId: string }[]>`
        SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'OFFICER' AND is_active = true LIMIT 3
      `;
      return fb.map((r) => r.userId);
    }

    case "OWNER": {
      const rows = await sql<{ userId: string }[]>`
        SELECT DISTINCT s.user_id AS "userId"
        FROM bayanat.asset_stakeholders s
        JOIN bayanat.asset_request_targets art
          ON art.asset_type_code = s.asset_type_code AND art.asset_id = s.asset_id
        WHERE art.request_id = ${requestId} AND s.role_code = 'OWNER'
      `;
      if (rows.length > 0) return rows.map((r) => r.userId);
      const fb = await sql<{ userId: string }[]>`
        SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'OFFICER' AND is_active = true LIMIT 3
      `;
      return fb.map((r) => r.userId);
    }

    case "OFFICER": {
      const rows = await sql<{ userId: string }[]>`
        SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'OFFICER' AND is_active = true LIMIT 5
      `;
      return rows.map((r) => r.userId);
    }

    case "ADMIN": {
      const rows = await sql<{ userId: string }[]>`
        SELECT user_id AS "userId" FROM bayanat.users WHERE role = 'ADMIN' AND is_active = true LIMIT 5
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
  stage_id         AS "stageId",
  stage_name_text  AS "stageName",
  stage_order      AS "stageOrder",
  required_role_code AS "assigneeRole",
  assignee_user_id AS "assigneeUserId",
  sla_days_count   AS "slaValue",
  is_final         AS "isFinal"
`;

export async function startWorkflow(requestId: number, requestTypeCode: string, requestTitle: string): Promise<void> {
  const [mapping] = await sql<{ workflowId: number }[]>`
    SELECT workflow_id AS "workflowId" FROM bayanat.request_type_workflows WHERE request_type_code = ${requestTypeCode}
  `;
  if (!mapping) return;

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

export async function advanceWorkflow(
  requestId:    number,
  actorUserId:  string,
  requestTitle: string,
  outcome:      "APPROVED" | "REJECTED" | "COMPLETED",
  notes?:       string,
): Promise<{ done: boolean; nextStageName?: string }> {
  const [inst] = await sql<{
    instanceId: number; workflowId: number; currentStageId: number; stageOrder: number; isFinal: boolean;
  }[]>`
    SELECT wi.instance_id        AS "instanceId",
           wi.workflow_id        AS "workflowId",
           wi.current_stage_id   AS "currentStageId",
           ws.stage_order        AS "stageOrder",
           ws.is_final           AS "isFinal"
    FROM bayanat.workflow_instances wi
    JOIN bayanat.workflow_stages ws ON ws.stage_id = wi.current_stage_id
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
    return { done: true };
  }

  await sql`UPDATE bayanat.workflow_instances SET current_stage_id=${next.stageId} WHERE instance_id=${inst.instanceId}`;
  await enterStage(inst.instanceId, next, requestId, requestTitle);
  return { done: false, nextStageName: next.stageName };
}
