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

const rows = await sql`
  SELECT art.asset_type_code, art.asset_id, art.asset_id_text, art.asset_name,
         ar.priority_code, ar.status_code, ar.title
  FROM bayanat.asset_request_targets art
  JOIN bayanat.asset_requests ar ON ar.request_id = art.request_id
  ORDER BY art.target_id
`;
console.table(rows.map(r => ({
  type: r.asset_type_code,
  id: r.asset_id,
  id_text: r.asset_id_text,
  name: r.asset_name,
  priority: r.priority_code,
  status: r.status_code,
})));
console.log(`Total targets: ${rows.length}`);
await sql.end();
