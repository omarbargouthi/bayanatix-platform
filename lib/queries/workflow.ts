import { sql } from "../db";

export type WorkflowStage = {
  stageId:        number;
  workflowId:     number;
  stageOrder:     number;
  stageName:      string;
  description:    string | null;
  assigneeRole:   string;
  assigneeUserId: string | null;
  slaValue:       number | null;
  isFinal:        boolean;
};

export type WorkflowDefinition = {
  workflowId:    number;
  workflowName:  string;
  description:   string | null;
  statusCode:    "Draft" | "Active" | "Deactive";
  createdAt:     string;
  stages:        WorkflowStage[];
  assignedTypes: string[];
};

export type StageHistoryEntry = {
  historyId:           number;
  stageId:             number;
  stageName:           string;
  stageOrder:          number;
  assignedToUserId:    string | null;
  assignedToName:      string | null;
  enteredAt:           string;
  completedAt:         string | null;
  completedByUserId:   string | null;
  completedByName:     string | null;
  outcomeCode:         string | null;
  notes:               string | null;
};

export type WorkflowInstance = {
  instanceId:       number;
  workflowId:       number;
  workflowName:     string;
  requestId:        number;
  currentStageId:   number | null;
  currentStageName: string | null;
  currentStageOrder:number | null;
  statusCode:       string;
  startedAt:        string;
  completedAt:      string | null;
  totalStages:      number;
  stages:           WorkflowStage[];
  history:          StageHistoryEntry[];
};

const STAGE_COLS = `
  ws.stage_id          AS "stageId",
  ws.workflow_id       AS "workflowId",
  ws.stage_order       AS "stageOrder",
  ws.stage_name_text   AS "stageName",
  ws.description_text  AS "description",
  ws.required_role_code AS "assigneeRole",
  ws.assignee_user_id  AS "assigneeUserId",
  ws.sla_days_count    AS "slaValue",
  ws.is_final          AS "isFinal"
`;

export async function getWorkflowForRequest(requestId: number): Promise<WorkflowInstance | null> {
  const [inst] = await sql<{
    instanceId: number; workflowId: number; workflowName: string;
    currentStageId: number | null; currentStageName: string | null;
    currentStageOrder: number | null; statusCode: string;
    startedAt: string; completedAt: string | null;
  }[]>`
    SELECT wi.instance_id          AS "instanceId",
           wi.workflow_id          AS "workflowId",
           wd.workflow_name_text   AS "workflowName",
           wi.current_stage_id     AS "currentStageId",
           cs.stage_name_text      AS "currentStageName",
           cs.stage_order          AS "currentStageOrder",
           wi.status_code          AS "statusCode",
           wi.started_at::text     AS "startedAt",
           wi.completed_at::text   AS "completedAt"
    FROM bayanat.workflow_instances wi
    JOIN bayanat.workflow_definitions wd ON wd.workflow_id = wi.workflow_id
    LEFT JOIN bayanat.workflow_stages cs ON cs.stage_id = wi.current_stage_id
    WHERE wi.request_id = ${requestId}
  `;
  if (!inst) return null;

  const stages = await sql<WorkflowStage[]>`
    SELECT ${sql.unsafe(STAGE_COLS)}
    FROM bayanat.workflow_stages ws
    WHERE ws.workflow_id = ${inst.workflowId}
    ORDER BY ws.stage_order
  `;

  const history = await sql<StageHistoryEntry[]>`
    SELECT h.history_id           AS "historyId",
           h.stage_id             AS "stageId",
           ws.stage_name_text     AS "stageName",
           ws.stage_order         AS "stageOrder",
           h.assigned_to_user_id  AS "assignedToUserId",
           au.full_name           AS "assignedToName",
           h.entered_at::text     AS "enteredAt",
           h.completed_at::text   AS "completedAt",
           h.completed_by_user_id AS "completedByUserId",
           cu.full_name           AS "completedByName",
           h.outcome_code         AS "outcomeCode",
           h.notes
    FROM bayanat.workflow_stage_history h
    JOIN bayanat.workflow_stages ws ON ws.stage_id = h.stage_id
    LEFT JOIN bayanat.users au ON au.user_id = h.assigned_to_user_id
    LEFT JOIN bayanat.users cu ON cu.user_id = h.completed_by_user_id
    WHERE h.instance_id = ${inst.instanceId}
    ORDER BY h.entered_at, h.history_id
  `;

  return { ...inst, requestId, totalStages: stages.length, stages, history };
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  const defs = await sql<Omit<WorkflowDefinition, "stages" | "assignedTypes">[]>`
    SELECT workflow_id        AS "workflowId",
           workflow_name_text AS "workflowName",
           description_text   AS "description",
           status_code        AS "statusCode",
           created_at::text   AS "createdAt"
    FROM bayanat.workflow_definitions ORDER BY workflow_id
  `;
  if (defs.length === 0) return [];

  const ids = defs.map((d) => d.workflowId);
  const stages = await sql<WorkflowStage[]>`
    SELECT ${sql.unsafe(STAGE_COLS)}
    FROM bayanat.workflow_stages ws
    WHERE ws.workflow_id IN ${sql(ids)}
    ORDER BY ws.workflow_id, ws.stage_order
  `;
  const mappings = await sql<{ requestTypeCode: string; workflowId: number }[]>`
    SELECT request_type_code AS "requestTypeCode", workflow_id AS "workflowId"
    FROM bayanat.request_type_workflows WHERE workflow_id IN ${sql(ids)}
  `;

  return defs.map((d) => ({
    ...d,
    stages:        stages.filter((s) => s.workflowId === d.workflowId),
    assignedTypes: mappings.filter((m) => m.workflowId === d.workflowId).map((m) => m.requestTypeCode),
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await sql<{ cnt: number }[]>`
    SELECT count(*)::int AS cnt FROM bayanat.notifications WHERE user_id = ${userId} AND is_read = false
  `;
  return row?.cnt ?? 0;
}

export async function isStageActor(requestId: number, userId: string): Promise<boolean> {
  const rows = await sql<{ h: number }[]>`
    SELECT h.history_id AS h
    FROM bayanat.workflow_stage_history h
    JOIN bayanat.workflow_instances wi ON wi.instance_id = h.instance_id
    WHERE wi.request_id          = ${requestId}
      AND wi.status_code         = 'ACTIVE'
      AND h.stage_id             = wi.current_stage_id
      AND h.assigned_to_user_id  = ${userId}
      AND h.completed_at IS NULL
    LIMIT 1
  `;
  return rows.length > 0;
}
