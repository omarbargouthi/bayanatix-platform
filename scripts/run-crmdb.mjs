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

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) { console.error("DATABASE_URL not set"); process.exit(1); }

const urlObj = new URL(rawUrl.replace(/^postgresql/, "http"));
const cfg = {
  host: urlObj.hostname,
  port: Number(urlObj.port) || 5432,
  username: decodeURIComponent(urlObj.username),
  password: decodeURIComponent(urlObj.password),
  ssl: rawUrl.includes("sslmode=require") ? "require" : false,
  max: 1,
  onnotice: () => {},
};

// Step 1: create the database
const adminSql = postgres({ ...cfg, database: "postgres" });
try {
  await adminSql`CREATE DATABASE crmdb`;
  console.log("✓ Created database: crmdb");
} catch (e) {
  if (e.code === "42P04") console.log("ℹ  Database crmdb already exists — continuing");
  else throw e;
}
await adminSql.end();

// Step 2: apply schema + seed to crmdb
const crmSql = postgres({ ...cfg, database: "crmdb" });
const sql = await readFile(resolve(process.cwd(), "db/crmdb_schema.sql"), "utf8");
await crmSql.unsafe(sql);
console.log("✓ Schema and seed data applied");
await crmSql.end();

// Step 3: register CRMDB as a connection in the bayanatix connection_registry
const bayanatSql = postgres({ ...cfg, database: urlObj.pathname.replace("/", "") || "bayanatix" });
const existing = await bayanatSql`SELECT connection_id FROM bayanat.connection_registry WHERE connection_name = 'CRMDB – CRM (Party Model)'`;
if (existing.length === 0) {
  await bayanatSql`
    INSERT INTO bayanat.connection_registry
      (connection_name, db_type_code, host_address, port_number, database_name, default_schema,
       username_text, password_text, ssl_enabled, is_active_boolean)
    VALUES
      ('CRMDB – CRM (Party Model)', 'POSTGRES', ${urlObj.hostname}, ${Number(urlObj.port) || 5432},
       'crmdb', 'crm', ${decodeURIComponent(urlObj.username)}, ${decodeURIComponent(urlObj.password)},
       false, true)
  `;
  console.log("✓ Registered CRMDB in connection_registry");
} else {
  console.log("ℹ  Connection already registered");
}
await bayanatSql.end();

console.log("\n✅  CRMDB setup complete!");
console.log("   Tables: party, person, organization, party_role, party_role_type,");
console.log("           contact_mechanism, party_contact, address, party_address,");
console.log("           party_relationship, segment, party_segment, customer_account,");
console.log("           product, opportunity, opportunity_product, interaction,");
console.log("           service_case, sales_order, order_line, payment, campaign,");
console.log("           campaign_response  (23 tables in crm schema)");
console.log("   Data:   20 parties · 12 customer accounts · 10 opportunities");
console.log("           20 interactions · 10 service cases · 8 orders · 2 campaigns");
