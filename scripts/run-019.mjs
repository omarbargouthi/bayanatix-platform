import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:5432/bayanatix");
const migration = readFileSync(join(__dirname, "../db/019_source_description_prev_rowcount.sql"), "utf8");

try {
  await sql.unsafe(migration);
  console.log("✅  Migration 019 applied successfully");
} catch (e) {
  console.error("❌  Migration 019 failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
