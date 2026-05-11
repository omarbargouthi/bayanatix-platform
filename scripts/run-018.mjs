import postgres from "postgres";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:5432/bayanatix");

try {
  const file = join(__dirname, "../db/018_cert_dimension_crm_seed.sql");
  await sql.unsafe(readFileSync(file, "utf8"));
  console.log("✅  Migration 018 applied successfully");
} catch (e) {
  console.error("❌  Migration 018 failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
