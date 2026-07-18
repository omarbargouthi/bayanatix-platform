import { readFile } from "node:fs/promises";
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
const DB = process.env.DATABASE_URL;
if (!DB) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = postgres(DB, { ssl: DB.includes("sslmode=require") ? "require" : "prefer" });
const text = await readFile(resolve(process.cwd(), "db/052_dsa_enhancements.sql"), "utf8");
await sql.unsafe(text);
console.log("✓ 052_dsa_enhancements.sql applied");
await sql.end();
