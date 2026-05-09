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

// Simulate the getDomains() query
const rows = await sql`
  select
    d.domain_code        as "domainCode",
    d.domain_name        as "name",
    d.compliance_pct     as "compliancePct",
    d.maturity_level     as "maturityLevel",
    d.alert_count        as "alertCount",
    d.sort_order         as "sortOrder",
    (
      select count(*)::int
      from bayanat.asset_request_targets art
      join bayanat.asset_requests ar on ar.request_id = art.request_id
      where art.asset_type_code = 'GOVERNANCE_DOMAIN'
        and art.asset_id_text = d.domain_code
        and ar.status_code in ('OPEN','IN_PROGRESS')
    ) as "openRequestCount"
  from bayanat.governance_domains d
  order by d.sort_order asc
`;

const withRequests = rows.filter(r => r.openRequestCount > 0);
console.log(`Domains with open requests: ${withRequests.length}`);
console.table(withRequests.map(r => ({
  code: r.domainCode,
  name: r.name,
  openRequests: r.openRequestCount,
  alertCount: r.alertCount,
})));

// Also verify entity request counts (triangle fix)
const entityReqs = await sql`
  select e.entity_name_text, count(*)::int as open_request_count
  from bayanat.data_entities e
  join bayanat.asset_request_targets art on art.asset_type_code = 'DATA_ENTITIES' and art.asset_id = e.entity_id
  join bayanat.asset_requests ar on ar.request_id = art.request_id and ar.status_code in ('OPEN','IN_PROGRESS')
  group by e.entity_id, e.entity_name_text
  order by open_request_count desc
`;
console.log("\nEntities with open requests (triangle count):");
console.table(entityReqs);

await sql.end();
