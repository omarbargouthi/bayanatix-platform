import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");
const migration = readFileSync(join(__dirname, "../db/031_governance_domains_ar.sql"), "utf8");

try {
  await sql.unsafe(migration);
  console.log("✅  Migration 031 applied successfully");
} catch (e) {
  console.error("❌  Migration 031 failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
