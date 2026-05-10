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

for (const tbl of ["workflow_definitions", "workflow_stages", "workflow_transitions"]) {
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'bayanat' AND table_name = ${tbl}
    ORDER BY ordinal_position
  `;
  console.log(`\n=== bayanat.${tbl} ===`);
  console.table(cols.map(c => ({ col: c.column_name, type: c.data_type, nullable: c.is_nullable })));
}

await sql.end();
