// Breach deadlines (db/207, db/212). Runs hourly as the BREACH_WATCH scheduled area: for
// each regulator notice with a fixed deadline (PDPL, GDPR: 72 hours) on an open breach
// that may have to be reported (risk not assessed yet, or at or above the law's
// threshold), reminds the handler and the data protection officers once when the
// deadline is less than DUE_SOON_HOURS away, and once when it has passed. Laws without a
// fixed deadline (PIPEDA "as soon as feasible", Law 25 "promptly") show as to notify
// on the register instead.
import { sql } from "../db";
import { markScheduledJobRan } from "../queries/scheduling";
import { breachHandlers, logBreachEvent, notifyBreach } from "./breach";
import { BREACH_LAWS, BREACH_REGULATIONS, DUE_SOON_HOURS, noticeRequired, type BreachRegulation, type BreachRisk } from "./breach-types";

type Due = { id: number; law: BreachRegulation; reference: string; title: string; owner: string | null; risk: BreachRisk | null; deadline: string; overdue: boolean };

export async function runBreachWatch(): Promise<{ dueSoon: number; overdue: number }> {
  // The laws with a fixed deadline, and their hours.
  const timed = BREACH_REGULATIONS.filter((l) => BREACH_LAWS[l].hours != null);
  const hours = timed.map((l) => BREACH_LAWS[l].hours as number);
  const rows = timed.length === 0 ? [] : await sql<Due[]>`
    SELECT b.breach_id AS id, n.regulation_code AS law, b.reference_code AS reference, b.title_text AS title,
           b.owner_user_id AS owner, b.risk_level_code AS risk,
           to_char((b.discovered_at + make_interval(hours => h.hours)) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') AS deadline,
           now() > b.discovered_at + make_interval(hours => h.hours) AS overdue
    FROM bayanat.privacy_breaches b
    JOIN bayanat.privacy_breach_notices n ON n.breach_id = b.breach_id AND n.regulation_code = ANY(b.regulations)
    JOIN unnest(${timed as string[]}::text[], ${hours}::int[]) AS h(code, hours) ON h.code = n.regulation_code
    WHERE b.status_code IN ('REPORTED', 'INVESTIGATING', 'CONTAINED') AND n.notified_at IS NULL
      AND now() > b.discovered_at + make_interval(hours => h.hours) - make_interval(hours => ${DUE_SOON_HOURS})
      AND (CASE WHEN now() > b.discovered_at + make_interval(hours => h.hours) THEN n.overdue_reminded_at IS NULL ELSE n.due_reminded_at IS NULL END)
  `;
  const due = rows.filter((r) => noticeRequired(r.law, r.risk));
  const team = due.length ? await breachHandlers() : [];
  let soon = 0, late = 0;
  for (const b of due) {
    const authority = BREACH_LAWS[b.law].authority;
    if (b.overdue) {
      late++;
      await notifyBreach(b.id, [b.owner, ...team], {
        title: `Regulator notification overdue (${b.law}) — ${b.reference}`,
        body: `${b.title}. The deadline to notify ${authority} passed at ${b.deadline}. Notify now and record the reason for the delay.`,
        severity: "ERROR",
      });
      // An overdue reminder also settles the "due soon" one.
      await sql`UPDATE bayanat.privacy_breach_notices SET overdue_reminded_at = now(), due_reminded_at = coalesce(due_reminded_at, now())
                WHERE breach_id = ${b.id} AND regulation_code = ${b.law}`;
      await logBreachEvent(b.id, "REMINDER_OVERDUE", null, `${b.law} · ${b.deadline}`);
    } else {
      soon++;
      await notifyBreach(b.id, [b.owner, ...team], {
        title: `Regulator notification due by ${b.deadline} (${b.law}) — ${b.reference}`,
        body: `${b.title}. Notify ${authority}, or record why the breach is unlikely to put people at risk.`,
      });
      await sql`UPDATE bayanat.privacy_breach_notices SET due_reminded_at = now() WHERE breach_id = ${b.id} AND regulation_code = ${b.law}`;
      await logBreachEvent(b.id, "REMINDER_DUE", null, `${b.law} · ${b.deadline}`);
    }
  }
  await markScheduledJobRan("BREACH_WATCH");
  return { dueSoon: soon, overdue: late };
}
