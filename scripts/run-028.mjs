import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");
const migration = readFileSync(join(__dirname, "../db/028_domain_config.sql"), "utf8");

try {
  await sql.unsafe(migration);
  console.log("✅  Migration 028 applied successfully");
  // Show seeded count
  const rows = await sql`SELECT COUNT(*) AS n FROM bayanat.gov_compliance_domain_config`;
  console.log(`   Seeded ${rows[0].n} domain config rows`);
} catch (e) {
  console.error("❌  Migration 028 failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
