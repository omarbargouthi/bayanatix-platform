import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "prefer" });

await sql`UPDATE bayanat.asset_request_targets SET asset_id_text = 'PDP'  WHERE asset_type_code = 'GOVERNANCE_DOMAIN' AND asset_id_text = 'PRIV'`;
await sql`UPDATE bayanat.asset_request_targets SET asset_id_text = 'DSH'  WHERE asset_type_code = 'GOVERNANCE_DOMAIN' AND asset_id_text = 'SHARE'`;
console.log("✓ Fixed PRIV→PDP, SHARE→DSH");

// Also fix the migration SQL for future reference
await sql.end();
