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
    JOIN bayanat.users u ON u.user_id = n.user_id
    WHERE n.user_id = ${userId}
      AND NOT (n.type = ANY(u.disabled_notification_types))
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

// Shared insert used by every "a background job finished" notifier —
// lib/queries/background-jobs.ts (compliance/report/translation exports),
// lib/crawler.ts (data source crawls), lib/queries/bulk-jobs.ts (Bulk
// Operations download/upload) all call this on completion/failure so a
// notification-format change only needs to happen in one place. Callers are
// expected to swallow their own errors around this (best-effort — a failed
// notification insert must never fail the job it's reporting on).
export async function createNotification(n: {
  userId: string; type: string; title: string; body?: string | null;
  severity?: "INFO" | "SUCCESS" | "WARNING" | "ERROR"; actionLabel?: string | null; actionHref?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO bayanat.notifications (user_id, type, title, body, severity, action_label, action_href)
    VALUES (${n.userId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${n.severity ?? "INFO"}, ${n.actionLabel ?? null}, ${n.actionHref ?? null})
  `;
}
