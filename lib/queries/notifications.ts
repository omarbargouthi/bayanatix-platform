import { sql } from "../db";
import type { Notification } from "../types";

export async function getNotifications(userId: string): Promise<Notification[]> {
  return sql<Notification[]>`
    SELECT
      notification_id AS "notificationId",
      type,
      title,
      body,
      is_read         AS "isRead",
      severity,
      domain_code     AS "domainCode",
      action_label    AS "actionLabel",
      action_href     AS "actionHref",
      created_at      AS "createdAt"
    FROM bayanat.notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
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
