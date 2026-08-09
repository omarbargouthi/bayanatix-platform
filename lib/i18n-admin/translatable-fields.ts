// Language Management — translatable-field registry (spec §3, list-value domain).
// A small declarative config proves the pattern for reference-table values that
// live in the DB rather than lib/i18n/*.ts: syncListValueKeys() upserts one
// translation_keys row per live source row (per configured field), so new
// tags/roles/etc. automatically show up as MISSING (AC-5) the next time it runs.
// Adding another table later is a config entry, not new code.
//
// Every entry is English-base + an Arabic (or other) secondary column — English is
// always the reference language, by design, so a new language added later always
// has something authoritative to translate from. gov_compliance_requirements is the
// one case where the English sidecar column isn't always filled in yet (imported
// Arabic-native regulatory text); missingBaseTextPlaceholder covers that: when
// English is empty but Arabic content exists, the key is still created (so the
// existing, real Arabic stays visible and tracked as VERIFIED) with a literal
// placeholder base_text instead of silently skipping the row. An admin fills in the
// real English via Maturity Index Setup as normal; re-running the sync then picks it
// up and replaces the placeholder.
//
// This is a one-way, read-from-source sync (same as the original 3 entries): it
// populates translation_keys/translations for coverage tracking, AI-translate, and
// Workbench editing. It does NOT feed back into the source tables, and the source
// tables' own admin UIs (ComplianceConfigSection.tsx, MaturityIndexClient.tsx, the
// app_lookups editor) are unchanged and remain the actual system of record — re-run
// the sync after editing those to pick up changes here.

import { sql } from "../db";

export type FieldMapping = {
  keySuffix: string; // "" preserves a bare `${keyPrefix}.${id}` key_code
  textColumn: string; // base-language column
  secondaryColumn?: string; // optional other-language column, pre-filled VERIFIED
};

export type TranslatableFieldConfig = {
  categoryCode: string;
  table: string; // schema-qualified, e.g. "bayanat.app_lookups"
  // Raw SQL expression producing the row's natural key as text. A plain column name
  // for single-column keys (class_code, role_code); a concatenation expression for
  // composite keys — app_lookups needs (lookup_group, lookup_code), not the numeric
  // lookup_id, because lookupLabel(group, code) at every call site resolves by that
  // pair, not a surrogate id.
  idExpr: string;
  keyPrefix: string; // key_code = `${keyPrefix}.${id}[.${keySuffix}]`
  baseLanguageCode?: string; // default 'en'
  secondaryLanguageCode?: string; // default 'ar'
  whereSql?: string; // optional raw WHERE fragment, e.g. "is_active = true"
  // When the base-language column is empty but the secondary column has content,
  // use this literal string as base_text instead of skipping the row entirely —
  // keeps the existing secondary-language content visible/tracked while flagging
  // the base as not yet filled in.
  missingBaseTextPlaceholder?: string;
  fields: FieldMapping[];
};

export const TRANSLATABLE_FIELDS: TranslatableFieldConfig[] = [
  {
    categoryCode: "LIST_LOOKUPS", table: "bayanat.app_lookups", idExpr: "lookup_group || '.' || lookup_code",
    keyPrefix: "list.app_lookups", whereSql: "coalesce(is_active, true) = true",
    fields: [{ keySuffix: "", textColumn: "lookup_label", secondaryColumn: "label_ar" }],
  },
  {
    categoryCode: "LIST_CLASSIFICATION", table: "bayanat.classification_types", idExpr: "class_code",
    keyPrefix: "list.classification_types",
    fields: [{ keySuffix: "", textColumn: "class_name_text" }],
  },
  {
    categoryCode: "LIST_ROLES", table: "bayanat.stakeholder_roles", idExpr: "role_code",
    keyPrefix: "list.stakeholder_roles",
    fields: [{ keySuffix: "", textColumn: "role_name_text" }],
  },
  {
    categoryCode: "LIST_COMPLIANCE_LEVELS", table: "bayanat.gov_compliance_level_config",
    idExpr: "framework_id::text || '.' || level_num::text", keyPrefix: "list.compliance_levels",
    fields: [
      { keySuffix: "name", textColumn: "name", secondaryColumn: "name_ar" },
      { keySuffix: "description", textColumn: "description", secondaryColumn: "description_ar" },
    ],
  },
  {
    categoryCode: "LIST_COMPLIANCE_DOMAINS", table: "bayanat.gov_compliance_domain_config",
    idExpr: "framework_id::text || '.' || domain_code", keyPrefix: "list.compliance_domains",
    fields: [
      { keySuffix: "name", textColumn: "name_en", secondaryColumn: "name_ar" },
      { keySuffix: "description", textColumn: "description_en", secondaryColumn: "description_ar" },
    ],
  },
  {
    categoryCode: "LIST_COMPLIANCE_CONFIG", table: "bayanat.compliance_config_items",
    idExpr: "framework_id::text || '.' || config_group || '.' || code", keyPrefix: "list.compliance_config",
    fields: [{ keySuffix: "", textColumn: "label", secondaryColumn: "label_ar" }],
  },
  {
    categoryCode: "COMPLIANCE_REQUIREMENTS", table: "bayanat.gov_compliance_requirements", idExpr: "req_id::text",
    keyPrefix: "compliance.req", missingBaseTextPlaceholder: "Not provided",
    fields: [
      { keySuffix: "question", textColumn: "question_en", secondaryColumn: "req_text" },
      { keySuffix: "supporting_evidence", textColumn: "supporting_evidence_en", secondaryColumn: "supporting_evidence" },
      { keySuffix: "admission_criteria", textColumn: "admission_criteria_en", secondaryColumn: "admission_criteria" },
      { keySuffix: "management_sector", textColumn: "management_sector_en", secondaryColumn: "management_sector" },
      { keySuffix: "directory_type", textColumn: "directory_type_en", secondaryColumn: "directory_type" },
    ],
  },
];

export type SyncResult = { keysCreated: number; keysUpdatedStale: number; secondarySeeded: number };

export async function syncListValueKeys(): Promise<SyncResult> {
  let keysCreated = 0, keysUpdatedStale = 0, secondarySeeded = 0;

  for (const cfg of TRANSLATABLE_FIELDS) {
    const baseLang = cfg.baseLanguageCode ?? "en";
    const secondaryLang = cfg.secondaryLanguageCode ?? "ar";

    const fieldCols = cfg.fields
      .map((f, i) => `${f.textColumn} AS text_${i}, ${f.secondaryColumn ?? "NULL"} AS secondary_${i}`)
      .join(", ");
    const query = `
      SELECT ${cfg.idExpr} AS id, ${fieldCols}
      FROM ${cfg.table}
      ${cfg.whereSql ? `WHERE ${cfg.whereSql}` : ""}
    `;
    const rows = (await sql.unsafe(query)) as Record<string, string | number | null>[];

    for (const row of rows) {
      for (const [i, field] of cfg.fields.entries()) {
        const rawSecondary = row[`secondary_${i}`];
        const hasSecondary = !!(rawSecondary && String(rawSecondary).trim());

        let baseText = String(row[`text_${i}`] ?? "").trim();
        if (!baseText) {
          if (cfg.missingBaseTextPlaceholder && hasSecondary) {
            baseText = cfg.missingBaseTextPlaceholder;
          } else {
            continue; // nothing in either language for this field — nothing to track
          }
        }
        const keyCode = field.keySuffix ? `${cfg.keyPrefix}.${row.id}.${field.keySuffix}` : `${cfg.keyPrefix}.${row.id}`;

        const [existing] = await sql<{ keyId: number; baseText: string }[]>`
          SELECT key_id AS "keyId", base_text AS "baseText" FROM bayanat.translation_keys WHERE key_code = ${keyCode}
        `;
        let keyId: number;
        if (!existing) {
          const [inserted] = await sql<{ keyId: number }[]>`
            INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code)
            VALUES (${cfg.categoryCode}, ${keyCode}, ${baseText}, ${baseLang})
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

        if (hasSecondary) {
          const inserted = await sql`
            INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
            VALUES (${keyId}, ${secondaryLang}, ${String(rawSecondary).trim()}, 'VERIFIED', now(), now())
            ON CONFLICT (key_id, language_code) DO NOTHING
            RETURNING translation_id
          `;
          if (inserted.length > 0) secondarySeeded++;
        }
      }
    }
  }

  return { keysCreated, keysUpdatedStale, secondarySeeded };
}
