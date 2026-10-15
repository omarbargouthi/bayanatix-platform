// Breach deadlines (db/207). Runs hourly as the BREACH_WATCH scheduled area: for each
// open breach that may have to be reported (risk not assessed yet, or assessed as a
// risk), reminds the handler and the data protection officers once when the regulator
// deadline is less than DUE_SOON_HOURS away, and once when it has passed.
import { sql } from "../db";
import { markScheduledJobRan } from "../queries/scheduling";
import { breachHandlers, logBreachEvent, notifyBreach } from "./breach";
import { AUTHORITY_HOURS, DUE_SOON_HOURS } from "./breach-types";

type Due = { id: number; reference: string; title: string; owner: string | null; deadline: string };

export async function runBreachWatch(): Promise<{ dueSoon: number; overdue: number }> {
  const open = sql`b.status_code IN ('REPORTED', 'INVESTIGATING', 'CONTAINED')
    AND b.authority_notified_at IS NULL AND (b.risk_level_code IS NULL OR b.risk_level_code <> 'UNLIKELY')`;
  const deadline = sql`b.discovered_at + make_interval(hours => ${AUTHORITY_HOURS})`;
  const cols = sql`b.breach_id AS id, b.reference_code AS reference, b.title_text AS title, b.owner_user_id AS owner,
    to_char((${deadline}) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') AS deadline`;

  const overdue = await sql<Due[]>`SELECT ${cols} FROM bayanat.privacy_breaches b
    WHERE ${open} AND now() > ${deadline} AND b.overdue_reminded_at IS NULL`;
  const dueSoon = await sql<Due[]>`SELECT ${cols} FROM bayanat.privacy_breaches b
    WHERE ${open} AND now() <= ${deadline} AND now() > ${deadline} - make_interval(hours => ${DUE_SOON_HOURS}) AND b.due_reminded_at IS NULL`;

  const team = overdue.length + dueSoon.length ? await breachHandlers() : [];
  for (const b of dueSoon) {
    await notifyBreach(b.id, [b.owner, ...team], {
      title: `Regulator notification due by ${b.deadline} — ${b.reference}`,
      body: `${b.title}. Notify the regulator, or record why the breach is unlikely to put people at risk.`,
    });
    await sql`UPDATE bayanat.privacy_breaches SET due_reminded_at = now() WHERE breach_id = ${b.id}`;
    await logBreachEvent(b.id, "REMINDER_DUE", null, b.deadline);
  }
  for (const b of overdue) {
    await notifyBreach(b.id, [b.owner, ...team], {
      title: `Regulator notification overdue — ${b.reference}`,
      body: `${b.title}. The ${AUTHORITY_HOURS}-hour deadline passed at ${b.deadline}. Notify the regulator now and record the reason for the delay.`,
      severity: "ERROR",
    });
    // An overdue reminder also settles the "due soon" one.
    await sql`UPDATE bayanat.privacy_breaches SET overdue_reminded_at = now(), due_reminded_at = coalesce(due_reminded_at, now()) WHERE breach_id = ${b.id}`;
    await logBreachEvent(b.id, "REMINDER_OVERDUE", null, b.deadline);
  }
  await markScheduledJobRan("BREACH_WATCH");
  return { dueSoon: dueSoon.length, overdue: overdue.length };
}
