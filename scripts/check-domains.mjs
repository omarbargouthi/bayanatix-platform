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

const domains = await sql`select domain_code, domain_name from bayanat.governance_domains order by domain_code`;
console.log("All governance_domain codes:");
console.table(domains);

const orphaned = await sql`
  select distinct art.asset_id_text
  from bayanat.asset_request_targets art
  where art.asset_type_code = 'GOVERNANCE_DOMAIN'
    and not exists (
      select 1 from bayanat.governance_domains d where d.domain_code = art.asset_id_text
    )
`;
if (orphaned.length > 0) {
  console.log("Orphaned domain codes in requests (not in governance_domains):");
  console.table(orphaned);
} else {
  console.log("No orphaned domain codes.");
}

await sql.end();
