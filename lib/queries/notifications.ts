import { sql } from "../db";
import type { Notification } from "../types";

export async function getNotifications(userId: string): Promise<Notification[]> {
  return sql<Notification[]>`
    SELECT
      n.notification_id AS "notificationId",
      n.type,
      n.title,
      n.body,
      n.is_read         AS "isRead",
      n.severity,
      n.domain_code     AS "domainCode",
      n.action_label    AS "actionLabel",
      n.action_href     AS "actionHref",
      n.created_at      AS "createdAt",
      -- Workflow notifications point at /requests/{id}; mark them actioned once this
      -- user has completed a stage on that request's workflow since the notification fired.
      CASE
        WHEN n.type = 'WORKFLOW' AND n.action_href ~ '^/requests/[0-9]+$' THEN EXISTS (
          SELECT 1
          FROM bayanat.workflow_stage_history h
          JOIN bayanat.workflow_instances wi ON wi.instance_id = h.instance_id
          WHERE wi.request_id = substring(n.action_href FROM '[0-9]+$')::int
            AND h.completed_by_user_id = n.user_id
            AND h.completed_at >= n.created_at
        )
        ELSE false
      END AS "actioned"
    FROM bayanat.notifications n
    WHERE n.user_id = ${userId}
    ORDER BY n.created_at DESC
    LIMIT 50
  `;
}

export async function markAllRead(userId: string): Promise<void> {
  await sql`
    UPDATE bayanat.notifications
    SET is_read = TRUE
    WHERE user_id = ${userId} AND is_read = FALSE
  `;
}
