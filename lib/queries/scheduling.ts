import { sql } from "../db";

// Area-level scheduling config (migration 129) -- one row per job AREA
// (Reports snapshot capture, Regulation trend capture), not per item. This is
// deliberately separate from bayanat.crawl_config.schedule_cron and
// bayanat.dq_rules.schedule_cron, which stay exactly as they are: those are
// per-row schedules (one connection, one rule), these are for jobs that apply
// across the whole area at once.
export type ScheduledJobArea = {
  areaCode:     string;
  scheduleCron: string;
  isEnabled:    boolean;
  lastRunAt:    string | null;
};

export async function listScheduledJobAreas(): Promise<ScheduledJobArea[]> {
  return sql<ScheduledJobArea[]>`
    SELECT area_code AS "areaCode", schedule_cron AS "scheduleCron",
           is_enabled AS "isEnabled", last_run_at AS "lastRunAt"
    FROM bayanat.scheduled_job_areas
    ORDER BY area_code
  `;
}

export async function updateScheduledJobArea(areaCode: string, scheduleCron: string, isEnabled: boolean): Promise<void> {
  await sql`
    UPDATE bayanat.scheduled_job_areas
    SET schedule_cron = ${scheduleCron}, is_enabled = ${isEnabled}, updated_at = now()
    WHERE area_code = ${areaCode}
  `;
}

export async function markScheduledJobRan(areaCode: string): Promise<void> {
  await sql`UPDATE bayanat.scheduled_job_areas SET last_run_at = now() WHERE area_code = ${areaCode}`;
}
