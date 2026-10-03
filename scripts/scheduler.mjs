#!/usr/bin/env node
// Standalone scheduler for catalog-crawl, DQ-rule, and area-level (Reports /
// Regulation) schedules — run alongside `npm run dev` / `next start`:
//   node scripts/scheduler.mjs
//
// Structurally different from scripts/pbix-scheduler.mjs: that script's cron
// expression IS the schedule (one global schedule for every PBIX_FOLDER
// connection). Here, each connection/rule/area has its OWN cron expression
// stored in the DB (crawl_config.schedule_cron / dq_rules.schedule_cron /
// scheduled_job_areas.schedule_cron), so this script's own cron expression is
// just the polling interval — every tick asks the "scheduled-*" API routes "is
// anything due yet?" (they compare each item's cron expression against its own
// last-run time via lib/scheduler-utils.ts). Same separate-plain-Node-process
// rationale as pbix-scheduler.mjs (node-cron + postgres.js break Next 14's
// edge-runtime instrumentation.ts bundling).
//
// The area-level route (scheduled-jobs/run, added for Reports/Regulation trend
// capture) is additive only — it does not change how crawl or DQ scheduling works.
import cron from "node-cron";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, ""); // .env.local has mixed LF/CRLF line endings
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

const POLL_SCHEDULE = process.env.SCHEDULER_POLL_CRON ?? "*/5 * * * *"; // check for due items every 5 minutes by default
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("[scheduler] CRON_SECRET not set (checked env and .env.local) — exiting");
  process.exit(1);
}
if (!cron.validate(POLL_SCHEDULE)) {
  console.error(`[scheduler] invalid SCHEDULER_POLL_CRON="${POLL_SCHEDULE}" — exiting`);
  process.exit(1);
}

async function hit(label, route) {
  try {
    const res = await fetch(`${APP_URL}${route}`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } });
    const body = await res.json();
    console.log(`[scheduler] ${new Date().toISOString()} ${label}`, JSON.stringify(body));
  } catch (err) {
    console.error(`[scheduler] ${label} tick failed:`, err instanceof Error ? err.message : err);
  }
}

async function tick() {
  await hit("crawl",         "/api/admin/sources/scheduled-crawl");
  await hit("dq",            "/api/dq/scheduled-run");
  await hit("scheduledJobs", "/api/admin/scheduled-jobs/run");
  await hit("retention",     "/api/admin/retention/run"); // runs at most once a day (lib/privacy/retention.ts)
}

cron.schedule(POLL_SCHEDULE, tick);
console.log(`[scheduler] running — polling every "${POLL_SCHEDULE}", target ${APP_URL}`);
