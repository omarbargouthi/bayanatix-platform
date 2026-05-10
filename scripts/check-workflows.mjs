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

// Check existing workflow tables
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'bayanat' AND table_name LIKE 'workflow%'
  ORDER BY table_name
`;
console.log("Workflow tables:", tables.map(t => t.table_name));

const defs = await sql`SELECT * FROM bayanat.workflow_definitions ORDER BY workflow_id`;
console.log(`Workflow definitions (${defs.length}):`, defs.map(d => d.workflow_name));

const stages = await sql`SELECT workflow_id, count(*)::int FROM bayanat.workflow_stages GROUP BY workflow_id ORDER BY workflow_id`;
console.log("Stages per workflow:", stages);

const mappings = await sql`SELECT * FROM bayanat.request_type_workflows`;
console.log("Type mappings:", mappings);

await sql.end();
