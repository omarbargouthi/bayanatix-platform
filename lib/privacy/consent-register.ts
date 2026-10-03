// Consent register (Audit & Logs > Consent): every recorded decision on the consent
// notice, and the active users who haven't accepted the current version yet.
import ExcelJS from "exceljs";
import { sql } from "../db";
import { describeUserAgent } from "./user-agent";

export type ConsentDecisionRow = {
  consentId: number; decidedAt: string; userId: string; userName: string | null; email: string | null;
  version: number; decision: "ACCEPTED" | "DECLINED"; ipAddress: string | null; userAgent: string | null;
};
export type PendingUserRow = {
  userId: string; userName: string; email: string; role: string; lastLoginAt: string | null;
  lastDecision: "ACCEPTED" | "DECLINED" | null; lastDecisionVersion: number | null; lastDecidedAt: string | null;
};
export type ConsentSummary = {
  enabled: boolean; version: number; activeUsers: number; accepted: number; declined: number; noDecision: number;
};
export type DecisionFilter = { q?: string; version?: number | null; decision?: "ACCEPTED" | "DECLINED" | null };

const PAGE_SIZE = 50;

export async function getConsentSummary(): Promise<ConsentSummary> {
  // Same rule as needsConsent(): any ACCEPTED on the current version counts as
  // accepted; otherwise DECLINED if they declined it, else no decision yet.
  const [row] = await sql<ConsentSummary[]>`
    WITH s AS (SELECT consent_enabled, consent_version FROM bayanat.platform_policy_settings WHERE settings_id = 1),
    latest AS (
      SELECT u.user_id, (
        SELECT CASE WHEN bool_or(c.decision_code = 'ACCEPTED') THEN 'ACCEPTED' WHEN count(*) > 0 THEN 'DECLINED' END
        FROM bayanat.user_consents c, s
        WHERE c.user_id = u.user_id AND c.consent_version = s.consent_version
      ) AS decision
      FROM bayanat.users u WHERE u.is_active
    )
    SELECT s.consent_enabled AS enabled, s.consent_version AS version,
      (SELECT count(*)::int FROM latest) AS "activeUsers",
      (SELECT count(*)::int FROM latest WHERE decision = 'ACCEPTED') AS accepted,
      (SELECT count(*)::int FROM latest WHERE decision = 'DECLINED') AS declined,
      (SELECT count(*)::int FROM latest WHERE decision IS NULL) AS "noDecision"
    FROM s
  `;
  return row;
}

export async function listConsentVersions(): Promise<number[]> {
  const rows = await sql<{ v: number }[]>`
    SELECT DISTINCT consent_version AS v FROM bayanat.user_consents
    UNION SELECT consent_version FROM bayanat.platform_policy_settings WHERE settings_id = 1
    ORDER BY 1 DESC
  `;
  return rows.map((r) => r.v);
}

function decisionWhere(f: DecisionFilter) {
  const like = f.q?.trim() ? `%${f.q.trim()}%` : null;
  return sql`
    WHERE true
    ${like ? sql`AND (u.full_name ILIKE ${like} OR u.email ILIKE ${like} OR c.user_id ILIKE ${like})` : sql``}
    ${f.version ? sql`AND c.consent_version = ${f.version}` : sql``}
    ${f.decision ? sql`AND c.decision_code = ${f.decision}` : sql``}
  `;
}

/** page = null returns every matching row (Excel export). */
export async function listConsentDecisions(f: DecisionFilter, page: number | null): Promise<{ rows: ConsentDecisionRow[]; total: number }> {
  const rows = await sql<(ConsentDecisionRow & { total: number })[]>`
    SELECT c.consent_id::float8 AS "consentId", c.decided_at::text AS "decidedAt", c.user_id AS "userId",
           u.full_name AS "userName", u.email, c.consent_version AS version, c.decision_code AS decision,
           c.ip_address_text AS "ipAddress", c.user_agent_text AS "userAgent", count(*) OVER ()::int AS total
    FROM bayanat.user_consents c
    LEFT JOIN bayanat.users u ON u.user_id = c.user_id
    ${decisionWhere(f)}
    ORDER BY c.decided_at DESC
    ${page ? sql`LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}` : sql``}
  `;
  return { rows: rows.map(({ total: _t, ...r }) => r), total: rows[0]?.total ?? 0 };
}

/** Active users without an ACCEPTED decision on the current version. */
export async function listPendingUsers(q?: string): Promise<PendingUserRow[]> {
  const like = q?.trim() ? `%${q.trim()}%` : null;
  return sql<PendingUserRow[]>`
    SELECT u.user_id AS "userId", u.full_name AS "userName", u.email, u.role,
           u.last_login_at::text AS "lastLoginAt",
           last.decision_code AS "lastDecision", last.consent_version AS "lastDecisionVersion", last.decided_at::text AS "lastDecidedAt"
    FROM bayanat.users u
    CROSS JOIN (SELECT consent_version FROM bayanat.platform_policy_settings WHERE settings_id = 1) s
    LEFT JOIN LATERAL (
      SELECT c.decision_code, c.consent_version, c.decided_at FROM bayanat.user_consents c
      WHERE c.user_id = u.user_id ORDER BY c.decided_at DESC LIMIT 1
    ) last ON true
    WHERE u.is_active
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.user_consents c
        WHERE c.user_id = u.user_id AND c.consent_version = s.consent_version AND c.decision_code = 'ACCEPTED'
      )
      ${like ? sql`AND (u.full_name ILIKE ${like} OR u.email ILIKE ${like} OR u.user_id ILIKE ${like})` : sql``}
    ORDER BY u.full_name
  `;
}

const fmtDate = (s: string | null) => (s ? new Date(s) : null);

/** Two sheets: the filtered decisions, and who hasn't accepted the current version. */
export async function buildConsentRegisterWorkbook(f: DecisionFilter): Promise<Buffer> {
  const [summary, decisions, pending] = await Promise.all([getConsentSummary(), listConsentDecisions(f, null), listPendingUsers(f.q)]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Bayanis";

  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF201C55" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  };

  const d = wb.addWorksheet("Decisions");
  d.columns = [
    { header: "Decided at", key: "decidedAt", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "User", key: "userName", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "User ID", key: "userId", width: 20 },
    { header: "Notice version", key: "version", width: 14 },
    { header: "Decision", key: "decision", width: 12 },
    { header: "IP address", key: "ipAddress", width: 18 },
    { header: "Browser", key: "browser", width: 26 },
    { header: "User agent", key: "userAgent", width: 60 },
  ];
  for (const r of decisions.rows) {
    d.addRow({
      ...r, decidedAt: fmtDate(r.decidedAt), userName: r.userName ?? r.userId,
      decision: r.decision === "ACCEPTED" ? "Accepted" : "Declined", browser: describeUserAgent(r.userAgent),
    });
  }
  head(d);

  const p = wb.addWorksheet(`Not accepted v${summary.version}`);
  p.columns = [
    { header: "User", key: "userName", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "User ID", key: "userId", width: 20 },
    { header: "Role", key: "role", width: 12 },
    { header: "Last sign-in", key: "lastLoginAt", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Latest decision", key: "lastDecision", width: 22 },
    { header: "Decided at", key: "lastDecidedAt", width: 20, style: { numFmt: "yyyy-mm-dd hh:mm" } },
  ];
  for (const r of pending) {
    p.addRow({
      ...r, lastLoginAt: fmtDate(r.lastLoginAt), lastDecidedAt: fmtDate(r.lastDecidedAt),
      lastDecision: r.lastDecision ? `${r.lastDecision === "ACCEPTED" ? "Accepted" : "Declined"} (v${r.lastDecisionVersion})` : "No decision yet",
    });
  }
  head(p);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
