#!/usr/bin/env node
// Demo source system: two HR / finance schemas of fictional data whose values really
// match the Sensitive Information Type patterns Bayanis detects, so the catalog's
// "Suggest Term" has something true to find when a table is sampled live:
//
//   hr_ca   — a Canadian employer:  SIN (Luhn-valid), Canadian phone / postal code /
//             passport formats, transit-institution-account bank numbers, BN and
//             GST/HST numbers, payment cards (Luhn-valid), an access-key secret
//   hr_ksa  — a Saudi employer:     National ID and Iqama (valid check digit), 05…
//             mobiles, SA IBANs (valid mod-97), passports, national address codes,
//             commercial registration and VAT numbers, vehicle plates
//
// Every person, number and address is generated — none belongs to anyone. Values are
// produced from a fixed seed, so each run creates the same data.
//
//   node scripts/seed-demo-source.mjs            (re)create both schemas
//   node scripts/seed-demo-source.mjs --drop     remove them
//
// Target database: DEMO_SOURCE_DATABASE_URL, default the local demo CRM database
// (postgres://postgres:test_password@localhost:5431/crmdb). It never touches Bayanis's
// own database. Afterwards: crawl the connection that points at this database, confirm
// the column types (Suggest Column Types), then use Suggest Term on a table.
import postgres from "postgres";

const URL = process.env.DEMO_SOURCE_DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/crmdb";
const sql = postgres(URL, { max: 1, onnotice: () => {} });
const N = 150; // employees per schema

// ── deterministic random ─────────────────────────────────────────────────────
let seed = 20261008;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];
const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join("");
const letters = (n, set = "ABCDEFGHJKLMNPRSTUVWXYZ") => Array.from({ length: n }, () => set[int(0, set.length - 1)]).join("");
const pad = (n, w) => String(n).padStart(w, "0");
const date = (y1, y2) => `${int(y1, y2)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`;

// ── check digits (the same algorithms lib/sit-classifier.ts verifies) ────────
function luhnComplete(partial) {
  for (let c = 0; c <= 9; c++) {
    const s = partial + c;
    let sum = 0, dbl = false;
    for (let i = s.length - 1; i >= 0; i--) { let d = Number(s[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
    if (sum % 10 === 0) return s;
  }
  throw new Error("unreachable");
}
function saIdComplete(first) {
  const nine = first + digits(8);
  let sum = 0;
  for (let i = 0; i < 9; i++) { let d = Number(nine[i]); if (i % 2 === 0) { d *= 2; if (d > 9) d = Math.floor(d / 10) + (d % 10); } sum += d; }
  return nine + ((10 - (sum % 10)) % 10);
}
function saIban() {
  const bban = pick(["80", "10", "20", "45", "55", "05"]) + digits(18);
  let rem = 0;
  for (const ch of bban + "281000") rem = (rem * 10 + Number(ch)) % 97; // "SA00" -> 28 10 00
  return `SA${pad(98 - rem, 2)}${bban}`;
}

// ── generated people ─────────────────────────────────────────────────────────
const CA_FIRST = ["Liam", "Olivia", "Noah", "Emma", "Lucas", "Charlotte", "Ethan", "Amelia", "Léa", "Mathis", "Chloé", "Gabriel", "Sophie", "Nathan", "Zoé", "Owen", "Maya", "Félix", "Aria", "Henry"];
const CA_LAST = ["Tremblay", "Roy", "Gagnon", "Smith", "Brown", "Martin", "Côté", "Wilson", "Lavoie", "Campbell", "Bouchard", "Singh", "Lee", "Morin", "Anderson", "Pelletier", "Chen", "Fortin", "MacDonald", "Nguyen"];
const CA_CITY = [["Toronto", "ON", "M"], ["Montréal", "QC", "H"], ["Vancouver", "BC", "V"], ["Calgary", "AB", "T"], ["Ottawa", "ON", "K"], ["Québec", "QC", "G"], ["Halifax", "NS", "B"], ["Winnipeg", "MB", "R"]];
const CA_AREA = ["416", "514", "604", "403", "613", "418", "902", "204", "647", "438"];
const KSA_FIRST = ["Abdullah", "Fahad", "Khalid", "Sultan", "Faisal", "Nasser", "Saud", "Turki", "Noura", "Sara", "Reem", "Lama", "Hessa", "Maha", "Dana", "Yousef", "Majed", "Bandar", "Mona", "Aljawhara"];
const KSA_LAST = ["Al-Qahtani", "Al-Harbi", "Al-Otaibi", "Al-Ghamdi", "Al-Shehri", "Al-Dosari", "Al-Zahrani", "Al-Mutairi", "Al-Anazi", "Al-Shammari", "Al-Malki", "Al-Subaie", "Al-Yami", "Al-Rashid", "Al-Tamimi"];
const KSA_CITY = ["Riyadh", "Jeddah", "Dammam", "Makkah", "Madinah", "Khobar", "Abha", "Tabuk"];
const DEPTS = ["Finance", "Human Resources", "Information Technology", "Operations", "Sales", "Customer Care", "Legal & Compliance", "Procurement"];
const emailOf = (f, l, dom) => `${f}.${l}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "") + `@${dom}`;

async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(i, i + 200))}`;
}

async function drop() {
  await sql`DROP SCHEMA IF EXISTS hr_ca CASCADE`;
  await sql`DROP SCHEMA IF EXISTS hr_ksa CASCADE`;
}

async function seedCanada() {
  await sql.unsafe(`
    CREATE SCHEMA hr_ca;
    COMMENT ON SCHEMA hr_ca IS 'Demo data (fictional): HR and finance of a Canadian employer';
    CREATE TABLE hr_ca.departments (department_id int PRIMARY KEY, department_name text NOT NULL, cost_centre_code text NOT NULL);
    CREATE TABLE hr_ca.employees (
      employee_id int PRIMARY KEY, employee_number text NOT NULL UNIQUE, first_name text NOT NULL, last_name text NOT NULL,
      social_insurance_number text, date_of_birth date, work_email text, mobile_phone text, passport_number text,
      health_insurance_number text, street_address text, city text, province_code text, postal_code text,
      department_id int REFERENCES hr_ca.departments, job_title text, hire_date date, employment_status text,
      annual_salary numeric(12,2), created_at timestamp DEFAULT now());
    CREATE TABLE hr_ca.employee_bank_accounts (
      bank_account_id int PRIMARY KEY, employee_id int REFERENCES hr_ca.employees, bank_name text,
      transit_institution_account_number text, is_primary boolean, effective_date date);
    CREATE TABLE hr_ca.corporate_cards (
      card_id int PRIMARY KEY, employee_id int REFERENCES hr_ca.employees, credit_card_number text, card_network text,
      expiry_month int, expiry_year int, monthly_limit numeric(10,2));
    CREATE TABLE hr_ca.vendors (
      vendor_id int PRIMARY KEY, vendor_name text NOT NULL, business_number text, gst_hst_number text,
      contact_email text, contact_phone text, postal_code text, payment_terms_days int);
    CREATE TABLE hr_ca.integration_credentials (
      credential_id int PRIMARY KEY, system_name text, api_key text, secret_token text, rotated_at date);
    CREATE VIEW hr_ca.v_employee_directory AS
      SELECT e.employee_number, e.first_name, e.last_name, e.work_email, e.mobile_phone, d.department_name, e.job_title
      FROM hr_ca.employees e JOIN hr_ca.departments d ON d.department_id = e.department_id
      WHERE e.employment_status = 'ACTIVE';
    CREATE VIEW hr_ca.v_payroll_summary AS
      SELECT d.department_name, count(*) AS headcount, sum(e.annual_salary) AS total_salary, avg(e.annual_salary) AS average_salary
      FROM hr_ca.employees e JOIN hr_ca.departments d ON d.department_id = e.department_id GROUP BY d.department_name;
  `);
  await insert("hr_ca.departments", DEPTS.map((n, i) => ({ department_id: i + 1, department_name: n, cost_centre_code: `CC-${pad(100 + i * 10, 4)}` })));
  const emp = [], bank = [], cards = [];
  for (let i = 1; i <= N; i++) {
    const f = pick(CA_FIRST), l = pick(CA_LAST), [city, prov, pc] = pick(CA_CITY);
    emp.push({
      employee_id: i, employee_number: `E${pad(10000 + i, 6)}`, first_name: f, last_name: l,
      social_insurance_number: luhnComplete(String(int(1, 7)) + digits(7)), date_of_birth: date(1962, 2003),
      work_email: emailOf(f, l, "mapleretail.example"), mobile_phone: `${pick(CA_AREA)}-555-${pad(int(100, 199), 4)}`,
      passport_number: rnd() < 0.7 ? letters(2) + digits(6) : null,
      health_insurance_number: `${digits(4)}-${digits(3)}-${digits(3)}-${letters(2)}`,
      street_address: `${int(10, 9999)} ${pick(["King St", "Rue Sainte-Catherine", "Main St", "Granville St", "Bank St", "Portage Ave"])}`,
      city, province_code: prov, postal_code: `${pc}${int(1, 9)}${letters(1)} ${int(1, 9)}${letters(1)}${int(1, 9)}`,
      department_id: int(1, DEPTS.length), job_title: pick(["Analyst", "Senior Analyst", "Manager", "Specialist", "Coordinator", "Director", "Associate"]),
      hire_date: date(2008, 2026), employment_status: rnd() < 0.9 ? "ACTIVE" : "TERMINATED", annual_salary: int(48, 185) * 1000,
    });
    bank.push({ bank_account_id: i, employee_id: i, bank_name: pick(["RBC", "TD", "BMO", "Scotiabank", "CIBC", "Desjardins"]),
      transit_institution_account_number: `${pick(["001", "002", "003", "004", "010", "815"])}-${digits(5)}-${digits(int(7, 12))}`, is_primary: true, effective_date: date(2015, 2026) });
    if (i % 3 === 0) cards.push({ card_id: i / 3, employee_id: i, credit_card_number: luhnComplete(pick(["4539", "4556", "5425", "5105"]) + digits(11)),
      card_network: pick(["VISA", "MASTERCARD"]), expiry_month: int(1, 12), expiry_year: int(2027, 2030), monthly_limit: int(2, 20) * 500 });
  }
  await insert("hr_ca.employees", emp); await insert("hr_ca.employee_bank_accounts", bank); await insert("hr_ca.corporate_cards", cards);
  await insert("hr_ca.vendors", Array.from({ length: 60 }, (_, k) => {
    const bn = digits(9);
    return { vendor_id: k + 1, vendor_name: `${pick(["Northern", "Laurentian", "Pacific", "Prairie", "Atlantic", "Great Lakes"])} ${pick(["Supply", "Logistics", "Technologies", "Consulting", "Foods", "Energy"])} ${pick(["Inc.", "Ltd.", "Ltée"])}`,
      business_number: bn, gst_hst_number: `${bn}RT${pad(int(1, 3), 4)}`, contact_email: `ap${k + 1}@vendor${k + 1}.example`,
      contact_phone: `${pick(CA_AREA)}-555-${pad(int(100, 199), 4)}`, postal_code: `${pick(["M", "H", "V", "T", "K"])}${int(1, 9)}${letters(1)} ${int(1, 9)}${letters(1)}${int(1, 9)}`, payment_terms_days: pick([15, 30, 45, 60]) };
  }));
  const AK = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  await insert("hr_ca.integration_credentials", ["Payroll provider", "Benefits portal", "Expense system", "Time tracking", "Background checks", "Learning platform", "Recruiting", "Document signing"].map((s, k) => ({
    credential_id: k + 1, system_name: s, api_key: "AKIA" + letters(16, AK), secret_token: letters(40, AK + "abcdefghijklmnopqrstuvwxyz"), rotated_at: date(2025, 2026) })));
}

async function seedSaudi() {
  await sql.unsafe(`
    CREATE SCHEMA hr_ksa;
    COMMENT ON SCHEMA hr_ksa IS 'Demo data (fictional): HR and finance of a Saudi employer';
    CREATE TABLE hr_ksa.departments (department_id int PRIMARY KEY, department_name text NOT NULL, cost_centre_code text NOT NULL);
    CREATE TABLE hr_ksa.employees (
      employee_id int PRIMARY KEY, employee_number text NOT NULL UNIQUE, first_name text NOT NULL, last_name text NOT NULL,
      nationality_code text, national_id text, iqama_number text, passport_number text, date_of_birth date,
      work_email text, mobile_number text, bank_account_iban text, building_number text, national_address_code text,
      city text, postal_code text, department_id int REFERENCES hr_ksa.departments, job_title text, hire_date date,
      employment_status text, monthly_salary numeric(12,2), created_at timestamp DEFAULT now());
    CREATE TABLE hr_ksa.vendors (
      vendor_id int PRIMARY KEY, vendor_name text NOT NULL, commercial_registration_number text, vat_registration_number text,
      bank_account_iban text, contact_email text, contact_mobile_number text, postal_code text);
    CREATE TABLE hr_ksa.fleet_vehicles (
      vehicle_id int PRIMARY KEY, vehicle_plate_number text, make text, model_year int, assigned_employee_id int REFERENCES hr_ksa.employees);
    CREATE VIEW hr_ksa.v_employee_directory AS
      SELECT e.employee_number, e.first_name, e.last_name, e.work_email, e.mobile_number, d.department_name, e.job_title
      FROM hr_ksa.employees e JOIN hr_ksa.departments d ON d.department_id = e.department_id
      WHERE e.employment_status = 'ACTIVE';
  `);
  await insert("hr_ksa.departments", DEPTS.map((n, i) => ({ department_id: i + 1, department_name: n, cost_centre_code: `CC-${pad(100 + i * 10, 4)}` })));
  const emp = [];
  for (let i = 1; i <= N; i++) {
    const f = pick(KSA_FIRST), l = pick(KSA_LAST), saudi = rnd() < 0.7;
    emp.push({
      employee_id: i, employee_number: `S${pad(20000 + i, 6)}`, first_name: f, last_name: l, nationality_code: saudi ? "SA" : pick(["EG", "IN", "PK", "JO", "PH"]),
      national_id: saudi ? saIdComplete("1") : null, iqama_number: saudi ? null : saIdComplete("2"),
      passport_number: letters(1) + digits(8), date_of_birth: date(1962, 2003), work_email: emailOf(f, l.replace("Al-", "al"), "najdholding.example"),
      mobile_number: `05${digits(8)}`, bank_account_iban: saIban(), building_number: digits(4), national_address_code: letters(4) + digits(4),
      city: pick(KSA_CITY), postal_code: String(int(11000, 82999)), department_id: int(1, DEPTS.length),
      job_title: pick(["Analyst", "Senior Analyst", "Manager", "Specialist", "Coordinator", "Director", "Associate"]), hire_date: date(2008, 2026),
      employment_status: rnd() < 0.9 ? "ACTIVE" : "TERMINATED", monthly_salary: int(6, 45) * 1000,
    });
  }
  await insert("hr_ksa.employees", emp);
  await insert("hr_ksa.vendors", Array.from({ length: 60 }, (_, k) => ({
    vendor_id: k + 1, vendor_name: `${pick(["Najd", "Hijaz", "Gulf", "Red Sea", "Eastern", "Tuwaiq"])} ${pick(["Trading", "Contracting", "Technologies", "Logistics", "Catering", "Energy"])} Co.`,
    commercial_registration_number: pick(["10", "40", "20"]) + digits(8), vat_registration_number: `3${digits(13)}3`, bank_account_iban: saIban(),
    contact_email: `finance${k + 1}@vendor${k + 1}.example`, contact_mobile_number: `05${digits(8)}`, postal_code: String(int(11000, 82999)) })));
  await insert("hr_ksa.fleet_vehicles", Array.from({ length: 40 }, (_, k) => ({
    vehicle_id: k + 1, vehicle_plate_number: `${letters(3)} ${int(1000, 9999)}`, make: pick(["Toyota", "Hyundai", "Nissan", "Ford", "Isuzu"]), model_year: int(2018, 2026), assigned_employee_id: int(1, N) })));
}

try {
  await drop();
  if (process.argv.includes("--drop")) console.log("✓ demo schemas removed");
  else {
    await seedCanada();
    await seedSaudi();
    const [c] = await sql`SELECT (SELECT count(*) FROM hr_ca.employees)::int AS ca, (SELECT count(*) FROM hr_ksa.employees)::int AS ksa`;
    console.log(`✓ demo source ready: hr_ca (${c.ca} employees, 6 tables, 2 views) and hr_ksa (${c.ksa} employees, 4 tables, 1 view)`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
