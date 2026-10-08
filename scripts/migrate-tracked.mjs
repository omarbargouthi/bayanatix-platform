#!/usr/bin/env node
// Tracked migrations — what a release runs. Applies each numbered db/NNN_*.sql file
// exactly once, in order, and records it in bayanat.schema_migrations.
//
//   node scripts/migrate-tracked.mjs              apply the files not yet recorded
//   node scripts/migrate-tracked.mjs --status     list what is applied / pending
//   node scripts/migrate-tracked.mjs --baseline   record every current file as applied
//                                                 WITHOUT running it
//
// --baseline is for a database that already has the schema (a restored dump, or a
// database migrated by hand before this tracker existed): it tells the tracker "this
// is where we are", so only later files are run. scripts/migrate.mjs (the old
// run-everything script) is not safe to re-run and is left for fresh installs only.
import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const m = raw.replace(/\r$/, "").match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("DATABASE_URL is not set."); process.exit(1); }
const mode = process.argv.includes("--baseline") ? "baseline" : process.argv.includes("--status") ? "status" : "apply";

const sql = postgres(DB, { ssl: DB.includes("sslmode=require") ? "require" : "prefer", max: 1, onnotice: () => {} });

// Same placeholder rule as scripts/migrate.mjs: a bare __NAME__ token is replaced by the
// env var NAME (used for the KPI sandbox role's password), or the file is refused.
function resolvePlaceholders(text, file) {
  return text.replace(/__([A-Z0-9_]+)__/g, (match, name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${file} references ${match}, but ${name} is not set`);
    return value.replace(/'/g, "''");
  });
}

try {
  await sql`CREATE SCHEMA IF NOT EXISTS bayanat`;
  await sql`
    CREATE TABLE IF NOT EXISTS bayanat.schema_migrations (
      file_name  text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      baselined  boolean NOT NULL DEFAULT false
    )
  `;

  const dir = resolve(process.cwd(), "db");
  const files = (await readdir(dir)).filter((f) => /^\d{3}.*\.sql$/.test(f)).sort();
  const applied = new Set((await sql`SELECT file_name FROM bayanat.schema_migrations`).map((r) => r.file_name));
  const pending = files.filter((f) => !applied.has(f));

  if (mode === "status") {
    console.log(`${applied.size} applied, ${pending.length} pending`);
    for (const f of pending) console.log(`  pending  ${f}`);
  } else if (mode === "baseline") {
    for (const f of pending) await sql`INSERT INTO bayanat.schema_migrations (file_name, baselined) VALUES (${f}, true)`;
    console.log(`✓ baseline recorded: ${pending.length} file(s) marked as already applied (${applied.size} were recorded before)`);
  } else {
    // A database that has the schema but no history must be baselined first — running
    // every file against it again would fail half-way or duplicate data.
    if (applied.size === 0) {
      const [{ exists }] = await sql`SELECT to_regclass('bayanat.users') IS NOT NULL AS exists`;
      if (exists) {
        console.error("This database already has the Bayanis schema but no migration history.\nRun once:  node scripts/migrate-tracked.mjs --baseline");
        process.exitCode = 1;
        throw new Error("baseline required");
      }
    }
    if (pending.length === 0) console.log("✓ database is up to date");
    for (const f of pending) {
      console.log(`→ applying ${f}`);
      const text = resolvePlaceholders(await readFile(resolve(dir, f), "utf8"), f);
      await sql.unsafe(text);
      await sql`INSERT INTO bayanat.schema_migrations (file_name) VALUES (${f})`;
    }
    if (pending.length > 0) console.log(`✓ ${pending.length} migration(s) applied`);
  }
} catch (err) {
  if (err.message !== "baseline required") console.error(`✗ migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
