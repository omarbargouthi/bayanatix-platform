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

console.log("=== stakeholder_roles ===");
const roles = await sql`SELECT role_code, role_name_text FROM bayanat.stakeholder_roles ORDER BY role_code`;
console.table(roles);

console.log("\n=== workflow_stages FK constraints ===");
const fks = await sql`
  SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'bayanat' AND tc.table_name = 'workflow_stages'
`;
console.table(fks);

console.log("\n=== existing workflow_stages rows ===");
const stages = await sql`SELECT stage_id, workflow_id, stage_name_text, required_role_code FROM bayanat.workflow_stages ORDER BY stage_id LIMIT 20`;
console.table(stages);

console.log("\n=== existing workflow_definitions rows ===");
const defs = await sql`SELECT workflow_id, workflow_name_text FROM bayanat.workflow_definitions ORDER BY workflow_id LIMIT 10`;
console.table(defs);

await sql.end();
