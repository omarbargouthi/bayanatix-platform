#!/usr/bin/env node
// Standalone scheduler for PBIX_FOLDER lineage connections — run alongside
// `npm run dev` / `next start`:
//   node scripts/pbix-scheduler.mjs
//
// Deliberately NOT wired through Next's instrumentation.ts hook: node-cron
// (and, transitively, this app's postgres.js DB client) use Node builtins
// (node:crypto, and postgres's Cloudflare Workers entrypoint pulling in
// cloudflare:sockets) that break Next 14's edge-runtime bundling of
// instrumentation.ts, even behind a runtime guard + dynamic import — Next
// still statically bundles anything dynamically imported for both the edge
// and nodejs targets. Running as a separate plain Node process sidesteps
// that entirely; each tick just calls the same API route an eventual Vercel
// Cron entry would call (app/api/lineage/pbix/scheduled-scan), matching how
// the existing report-snapshot cron feature is structured.
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

const SCHEDULE = process.env.PBIX_SCAN_CRON ?? "0 2 * * *"; // nightly at 02:00 by default
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("[pbix-scheduler] CRON_SECRET not set (checked env and .env.local) — exiting");
  process.exit(1);
}
if (!cron.validate(SCHEDULE)) {
  console.error(`[pbix-scheduler] invalid PBIX_SCAN_CRON="${SCHEDULE}" — exiting`);
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(`${APP_URL}/api/lineage/pbix/scheduled-scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const body = await res.json();
    console.log(`[pbix-scheduler] ${new Date().toISOString()}`, JSON.stringify(body));
  } catch (err) {
    console.error("[pbix-scheduler] tick failed:", err instanceof Error ? err.message : err);
  }
}

cron.schedule(SCHEDULE, tick);
console.log(`[pbix-scheduler] running — schedule "${SCHEDULE}", target ${APP_URL}`);
