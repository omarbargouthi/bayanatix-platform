import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL || "postgres://postgres:Test@123@localhost:5432/bayanatix");

try {
  const migration = readFileSync(join(__dirname, "../db/017_crawler_extensions.sql"), "utf8");
  await sql.unsafe(migration);
  console.log("✓  Migration 017 applied");
} catch (e) {
  console.error("✗  Migration 017 failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
