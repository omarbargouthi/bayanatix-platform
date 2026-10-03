// One-off (safe to re-run): seals any plain-text data source password still in
// bayanat.connection_registry.password_text with the app's AES-256-GCM key
// (LLM_SECRETS_MASTER_KEY, lib/secrets.ts). Rows already sealed ("enc:v1:...")
// are left alone. The app decrypts on read, so it works before and after this runs.
//
// Usage: node scripts/encrypt-connection-passwords.mts

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const { sealSecret, openSecret, isSealed } = await import("../lib/secrets.ts");

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("DATABASE_URL is not set."); process.exit(1); }
const sql = postgres(DB, { ssl: DB.includes("sslmode=require") ? "require" : "prefer" });

const rows = await sql<{ id: number; name: string; pw: string | null }[]>`
  SELECT connection_id AS id, connection_name AS name, password_text AS pw FROM bayanat.connection_registry
  WHERE password_text IS NOT NULL AND password_text <> ''
`;
let sealed = 0, already = 0;
for (const r of rows) {
  if (isSealed(r.pw)) { already++; continue; }
  const value = sealSecret(r.pw)!;
  if (openSecret(value) !== r.pw) throw new Error(`Round-trip check failed for connection ${r.id} — nothing written for it`);
  await sql`UPDATE bayanat.connection_registry SET password_text = ${value} WHERE connection_id = ${r.id} AND password_text = ${r.pw}`;
  sealed++;
  console.log(`  sealed: #${r.id} ${r.name}`);
}
console.log(`✓ ${sealed} password(s) encrypted, ${already} already encrypted, ${rows.length} with a password in total`);
await sql.end();
