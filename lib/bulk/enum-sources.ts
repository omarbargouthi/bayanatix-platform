// Live enum value lists for dropdown data-validation (spec §2.2) — read from
// reference data at export time so the dropdowns always match current config.

import { sql } from "../db";
import type { EnumSource } from "./sheets";

const TABLE_CATEGORY_VALUES = ["MASTER", "TRANSACTIONAL", "REFERENCE", "SETUP", "SYSTEM"];
const COLUMN_TYPE_VALUES = ["BUSINESS", "TECHNICAL"];

export async function loadEnumValues(source: EnumSource): Promise<string[]> {
  switch (source) {
    case "TABLE_CATEGORY": return TABLE_CATEGORY_VALUES;
    case "COLUMN_TYPE": return COLUMN_TYPE_VALUES;
    case "CLASSIFICATION": {
      const rows = await sql<{ code: string }[]>`SELECT class_code AS code FROM bayanat.classification_types ORDER BY class_code`;
      return rows.map((r) => r.code);
    }
    case "PI_CATEGORY": {
      const rows = await sql<{ code: string }[]>`SELECT category_code AS code FROM bayanat.pi_category_types ORDER BY category_code`;
      return rows.map((r) => r.code);
    }
    default: return [];
  }
}

export async function loadExistingTagNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`SELECT tag_name AS name FROM bayanat.tags ORDER BY tag_name`;
  return rows.map((r) => r.name);
}

export async function loadExistingTermNames(): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    SELECT term_name_text AS name FROM bayanat.business_glossaries WHERE parent_glossary_id IS NOT NULL ORDER BY term_name_text
  `;
  return rows.map((r) => r.name);
}
