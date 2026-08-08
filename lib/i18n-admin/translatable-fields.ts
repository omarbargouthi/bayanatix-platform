// Language Management — translatable-field registry (spec §3, list-value domain).
// A small declarative config proves the pattern for reference-table values that
// live in the DB rather than lib/i18n/*.ts: syncListValueKeys() upserts one
// translation_keys row per live source row, so new tags/roles/etc. automatically
// show up as MISSING (AC-5) the next time it runs. Adding another table later is a
// one-line entry here, not new code.
//
// 3 representative entries this pass: app_lookups (already has a label_ar column —
// syncing pre-fills it as a VERIFIED translation, same "existing Arabic becomes the
// starter translation" behavior the seed script does for UI strings), and
// classification_types / stakeholder_roles (confirmed via db/000_base_schema.sql to
// have NO Arabic column at all today — real gaps, not padding).

import { sql } from "../db";

export type TranslatableFieldConfig = {
  categoryCode: string;
  table: string; // schema-qualified, e.g. "bayanat.app_lookups"
  // Raw SQL expression producing the row's natural key as text. A plain column name
  // for single-column keys (class_code, role_code); a concatenation expression for
  // composite keys — app_lookups needs (lookup_group, lookup_code), not the numeric
  // lookup_id, because lookupLabel(group, code) at every call site resolves by that
  // pair, not a surrogate id.
  idExpr: string;
  textColumn: string;
  keyPrefix: string; // key_code = `${keyPrefix}.${id}`
  arColumn?: string; // existing Arabic column to pre-fill as a VERIFIED translation, if any
  whereSql?: string; // optional raw WHERE fragment, e.g. "is_active = true"
};

export const TRANSLATABLE_FIELDS: TranslatableFieldConfig[] = [
  {
    categoryCode: "LIST_LOOKUPS", table: "bayanat.app_lookups", idExpr: "lookup_group || '.' || lookup_code", textColumn: "lookup_label",
    keyPrefix: "list.app_lookups", arColumn: "label_ar", whereSql: "coalesce(is_active, true) = true",
  },
  {
    categoryCode: "LIST_CLASSIFICATION", table: "bayanat.classification_types", idExpr: "class_code", textColumn: "class_name_text",
    keyPrefix: "list.classification_types",
  },
  {
    categoryCode: "LIST_ROLES", table: "bayanat.stakeholder_roles", idExpr: "role_code", textColumn: "role_name_text",
    keyPrefix: "list.stakeholder_roles",
  },
];

export type SyncResult = { keysCreated: number; keysUpdatedStale: number; arSeeded: number };

export async function syncListValueKeys(): Promise<SyncResult> {
  let keysCreated = 0, keysUpdatedStale = 0, arSeeded = 0;

  for (const cfg of TRANSLATABLE_FIELDS) {
    const query = `
      SELECT ${cfg.idExpr} AS id, ${cfg.textColumn} AS text_value, ${cfg.arColumn ? cfg.arColumn : "NULL"} AS ar_value
      FROM ${cfg.table}
      ${cfg.whereSql ? `WHERE ${cfg.whereSql}` : ""}
    `;
    const rows = (await sql.unsafe(query)) as { id: string | number; text_value: string | null; ar_value: string | null }[];

    for (const row of rows) {
      const baseText = (row.text_value ?? "").trim();
      if (!baseText) continue;
      const keyCode = `${cfg.keyPrefix}.${row.id}`;

      const [existing] = await sql<{ keyId: number; baseText: string }[]>`
        SELECT key_id AS "keyId", base_text AS "baseText" FROM bayanat.translation_keys WHERE key_code = ${keyCode}
      `;
      let keyId: number;
      if (!existing) {
        const [inserted] = await sql<{ keyId: number }[]>`
          INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
          VALUES (${cfg.categoryCode}, ${keyCode}, ${baseText})
          RETURNING key_id AS "keyId"
        `;
        keyId = inserted.keyId;
        keysCreated++;
      } else {
        keyId = existing.keyId;
        if (existing.baseText !== baseText) {
          await sql`UPDATE bayanat.translation_keys SET base_text = ${baseText} WHERE key_id = ${keyId}`;
          await sql`UPDATE bayanat.translations SET status_code = 'STALE' WHERE key_id = ${keyId} AND status_code <> 'MISSING'`;
          keysUpdatedStale++;
        }
      }

      if (row.ar_value && row.ar_value.trim()) {
        const inserted = await sql`
          INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
          VALUES (${keyId}, 'ar', ${row.ar_value.trim()}, 'VERIFIED', now(), now())
          ON CONFLICT (key_id, language_code) DO NOTHING
          RETURNING translation_id
        `;
        if (inserted.length > 0) arSeeded++;
      }
    }
  }

  return { keysCreated, keysUpdatedStale, arSeeded };
}
