import { CronExpressionParser } from "cron-parser";

// Shared "is this scheduled item due yet" check for both crawl scheduling
// (bayanat.crawl_config.schedule_cron) and DQ rule scheduling
// (bayanat.dq_rules.schedule_cron) — same standard 5-field cron expression in
// both places. `lastRunAt=null` (never run before) is treated as due immediately
// rather than waiting for the next natural cron boundary, so a freshly-scheduled
// item fires on the very next scheduler tick instead of possibly waiting up to a
// full cycle.
export function isScheduleDue(cronExpr: string | null | undefined, lastRunAt: string | Date | null | undefined): boolean {
  if (!cronExpr) return false;
  try {
    const anchor = lastRunAt ? new Date(lastRunAt) : new Date(0);
    const next = CronExpressionParser.parse(cronExpr, { currentDate: anchor }).next().toDate();
    return next.getTime() <= Date.now();
  } catch {
    return false; // invalid cron expression — skip rather than crash the whole batch
  }
}

export function isValidCronExpression(cronExpr: string): boolean {
  try { CronExpressionParser.parse(cronExpr); return true; }
  catch { return false; }
}
