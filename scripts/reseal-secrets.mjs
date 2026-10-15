#!/usr/bin/env node
// Re-encrypts every stored secret with the current key — the command-line twin of
// Configuration › Encryption Keys › Re-encrypt, for a key rotation done on the server.
// The running app does the work (it holds the keys), so this only calls it, with the
// same CRON_SECRET bearer as scripts/scheduler.mjs. Safe to re-run.
//
// Rotation: put the new key in LLM_SECRETS_MASTER_KEY, the old one in
// LLM_SECRETS_PREVIOUS_KEYS, restart the app, run this, then remove the old key.
//
// Usage: node scripts/reseal-secrets.mjs            re-encrypt, then report
//        node scripts/reseal-secrets.mjs --status   report only, writes nothing
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const m = rawLine.replace(/\r$/, "").match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET;
if (!SECRET) { console.error("CRON_SECRET is not set (checked env and .env.local)."); process.exit(1); }

const statusOnly = process.argv.includes("--status");
const res = await fetch(`${APP_URL}/api/admin/secrets`, {
  method: statusOnly ? "GET" : "POST",
  headers: { Authorization: `Bearer ${SECRET}` },
});
const body = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`Failed (${res.status}): ${body.error ?? "no details"}`); process.exit(1); }

const status = statusOnly ? body : body.status;
if (!statusOnly) {
  const r = body.result;
  console.log(`Key ${r.keyId}: ${r.resealed} re-encrypted, ${r.alreadyCurrent} already current, ${r.failed.length} failed`);
  for (const f of r.failed) console.log(`  failed: ${f.store} — ${f.label}: ${f.reason}`);
  if (r.failed.length) process.exitCode = 1;
}
console.log(`Provider ${status.provider}, current key ${status.currentKeyId}, previous keys: ${status.previousKeyIds.join(", ") || "none"}`);
for (const s of status.stores) {
  const c = s.counts;
  console.log(`  ${s.name}: ${s.total} — ${c.current} current, ${c["older-key"]} older key, ${c.plain} not encrypted, ${c.unreadable} unreadable`);
  for (const l of s.unreadable) console.log(`    unreadable: ${l}`);
}
if (status.unusedPreviousKeyIds.length) {
  console.log(`No stored secret uses ${status.unusedPreviousKeyIds.join(", ")} any more; it can be removed from LLM_SECRETS_PREVIOUS_KEYS.`);
}
