import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

// Tiny .env.local loader so the script works on any Node version
// (older Node doesn't support --env-file).
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = postgres(DB, { ssl: DB.includes("sslmode=require") ? "require" : "prefer" });

// Simple env-var placeholder substitution for migrations that set a DB role's
// password — keeps the actual secret out of the committed .sql file (see
// db/071_reports_extended.sql / db/114_rotate_kpi_sandbox_password.sql). A
// placeholder is a bare token like __SOME_NAME__; the matching env var must be
// set or the migration containing it is refused rather than silently applying
// a wrong/empty password.
function resolvePlaceholders(sqlText, fileName) {
  return sqlText.replace(/__([A-Z0-9_]+)__/g, (match, envName) => {
    const value = process.env[envName];
    if (!value) {
      throw new Error(`${fileName} references ${match}, but ${envName} is not set in .env.local`);
    }
    return value.replace(/'/g, "''");
  });
}

const dir = resolve(process.cwd(), "db");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  console.log(`→ running ${file}`);
  const sqlText = await readFile(resolve(dir, file), "utf8");
  await sql.unsafe(resolvePlaceholders(sqlText, file));
}

console.log("✓ migrations complete");
await sql.end();
