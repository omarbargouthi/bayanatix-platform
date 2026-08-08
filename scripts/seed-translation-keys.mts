// One-off seed for the Language Management foundation pass. Flattens the
// compile-time lib/i18n/en.ts / ar.ts catalogs into bayanat.translation_keys /
// bayanat.translations rows (the "Arabic starter pack" — real hand-translated
// content already in the app, not a curated import file), one UI-domain
// translation_category per top-level I18nStrings section (created on demand, so
// this script never needs updating when a new section is added to strings.ts).
// Also migrates any bayanat.ui_translations rows (the old DB override layer) as
// HUMAN_EDITED, which should win over the ar.ts starter value for the same key.
//
// Safe to re-run: unchanged base_text / already-present translations are left
// alone; a changed base_text updates the key and marks any non-MISSING
// translations for it STALE (AC-6) rather than silently overwriting them.
//
// Usage: node scripts/seed-translation-keys.mts   (run against the dev DB via
// .env.local's DATABASE_URL — same connection convention as scripts/migrate.mjs)

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { en } from "../lib/i18n/en.ts";
import { ar } from "../lib/i18n/ar.ts";

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
if (!DB) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}
const sql = postgres(DB, { ssl: DB.includes("sslmode=require") ? "require" : "prefer" });

// Section name -> nicer admin-facing category label. Falls back to a simple
// camelCase -> Title Case split for any section not listed here.
const SECTION_LABELS: Record<string, string> = {
  nav: "Navigation", dq: "Data Quality", openData: "Open Data", chat: "Chat Assistant",
};
function titleCase(section: string): string {
  return SECTION_LABELS[section] ?? section.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function flatten(obj: Record<string, unknown>, prefix: string[]): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out.push({ path: [...prefix, k].join("."), value: v });
    else if (v && typeof v === "object") out.push(...flatten(v as Record<string, unknown>, [...prefix, k]));
  }
  return out;
}

let categoriesCreated = 0, keysCreated = 0, keysUpdatedStale = 0, keysUnchanged = 0, arInserted = 0, uiTranslationsMigrated = 0, uiTranslationsOrphaned = 0;

for (const section of Object.keys(en) as (keyof typeof en)[]) {
  const categoryCode = `UI_${String(section).toUpperCase()}`;
  const inserted = await sql`
    INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code)
    VALUES (${categoryCode}, ${titleCase(String(section))}, 'UI')
    ON CONFLICT (category_code) DO NOTHING
    RETURNING category_code
  `;
  if (inserted.length > 0) categoriesCreated++;

  const enLeaves = flatten(en[section] as Record<string, unknown>, [String(section)]);
  const arLeaves = new Map(flatten(ar[section] as Record<string, unknown>, [String(section)]).map((l) => [l.path, l.value]));

  for (const { path: keyCode, value: baseText } of enLeaves) {
    const existing = await sql`SELECT key_id, base_text FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
    let keyId: number;
    if (existing.length === 0) {
      const [row] = await sql`
        INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
        VALUES (${categoryCode}, ${keyCode}, ${baseText})
        RETURNING key_id
      `;
      keyId = row.key_id;
      keysCreated++;
    } else {
      keyId = existing[0].key_id;
      if (existing[0].base_text !== baseText) {
        await sql`UPDATE bayanat.translation_keys SET base_text = ${baseText} WHERE key_id = ${keyId}`;
        await sql`
          UPDATE bayanat.translations SET status_code = 'STALE'
          WHERE key_id = ${keyId} AND status_code <> 'MISSING'
        `;
        keysUpdatedStale++;
      } else {
        keysUnchanged++;
      }
    }

    const arValue = arLeaves.get(keyCode);
    if (arValue) {
      const result = await sql`
        INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
        VALUES (${keyId}, 'ar', ${arValue}, 'VERIFIED', now(), now())
        ON CONFLICT (key_id, language_code) DO NOTHING
        RETURNING translation_id
      `;
      if (result.length > 0) arInserted++;
    }
  }
}

// Migrate ui_translations (the old DB override layer) as HUMAN_EDITED — these were
// manually curated so they should win over the ar.ts starter value for the same
// key. 'en' rows are skipped: the new runtime always sources English from
// lib/i18n/en.ts directly (never from the translations table), so an old English
// override has nothing left to feed.
const overrides = await sql`SELECT key, lang, value FROM bayanat.ui_translations WHERE lang <> 'en'`;
for (const row of overrides) {
  const [key] = await sql`SELECT key_id FROM bayanat.translation_keys WHERE key_code = ${row.key}`;
  if (!key) {
    console.warn(`  ⚠ ui_translations key "${row.key}" (${row.lang}) has no matching translation_key — skipped (likely a removed string)`);
    uiTranslationsOrphaned++;
    continue;
  }
  await sql`
    INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at)
    VALUES (${key.key_id}, ${row.lang}, ${row.value}, 'HUMAN_EDITED', now())
    ON CONFLICT (key_id, language_code) DO UPDATE SET
      translated_text = EXCLUDED.translated_text, status_code = 'HUMAN_EDITED', translated_at = now()
  `;
  uiTranslationsMigrated++;
}

console.log(`✓ categories created: ${categoriesCreated}`);
console.log(`✓ keys created: ${keysCreated}, updated (marked STALE): ${keysUpdatedStale}, unchanged: ${keysUnchanged}`);
console.log(`✓ ar starter translations inserted: ${arInserted}`);
console.log(`✓ ui_translations migrated: ${uiTranslationsMigrated}, orphaned/skipped: ${uiTranslationsOrphaned}`);

await sql.end();
