// Bulk Download/Upload — extended/custom-attribute columns (the "ext:<code>"
// columns the rest of this module's comments anticipated). Bridges the Custom
// Attributes framework (db/090_custom_attributes.sql, lib/queries/custom-attributes.ts
// — admin-defined fields on the native DataSources/Tables/Columns/BusinessTerms
// asset types) onto the bulk sheet FieldDef registry in ./sheets.ts.
//
// getFieldsForSheet() stays synchronous (it's called from tight loops and .some()
// callbacks), so every entry point (workbook-writer, workbook-reader, validate,
// result-writer) fetches this map ONCE up front and threads it through instead of
// each FieldDef lookup hitting the DB itself.

import { listAllCustomAttributeDefinitions } from "../queries/custom-attributes";
import type { CustomAttributeAssetType, CustomAttributeDataType } from "../types";
import type { FieldDef, FieldType, SheetName } from "./sheets";

// Note: this is a DIFFERENT string than SHEET_ASSET_TYPE.BusinessTerms
// ("BUSINESS_TERMS", used for permissions/audit) — the Custom Attributes tables
// use "BUSINESS_GLOSSARIES" as their asset_type_code for the same underlying rows.
const SHEET_TO_CUSTOM_ATTR_ASSET_TYPE: Partial<Record<SheetName, CustomAttributeAssetType>> = {
  DataSources: "DATA_SOURCES",
  Tables: "DATA_ENTITIES",
  Columns: "DATA_ATTRIBUTES",
  BusinessTerms: "BUSINESS_GLOSSARIES",
};

// CustomAttributeAssetType -> the sheet(s) that surface it, for the reverse lookup
// commit.ts needs (asset type it just wrote -> which custom-attribute bucket to save into).
export const CUSTOM_ATTR_ASSET_TYPE_FOR_SHEET = SHEET_TO_CUSTOM_ATTR_ASSET_TYPE;

// DATE/USER/URL have no dedicated FieldType/validation in the bulk module — they
// round-trip as plain text (v1 scope; no special date/user-lookup/url validation).
function mapDataType(dataType: CustomAttributeDataType): FieldType {
  switch (dataType) {
    case "NUMBER": return "NUMBER";
    case "BOOLEAN": return "BOOLEAN";
    case "LONGTEXT": return "LONGTEXT";
    case "ENUM": return "ENUM";
    default: return "TEXT";
  }
}

export const EXT_FIELD_PREFIX = "ext:";

/** One batched query, grouped per sheet — cheaper than one query per sheet. */
export async function loadExtendedFieldsBySheet(): Promise<Partial<Record<SheetName, FieldDef[]>>> {
  const defs = await listAllCustomAttributeDefinitions();
  const result: Partial<Record<SheetName, FieldDef[]>> = {};

  for (const [sheet, assetType] of Object.entries(SHEET_TO_CUSTOM_ATTR_ASSET_TYPE) as [SheetName, CustomAttributeAssetType][]) {
    const forSheet = defs
      .filter((d) => d.assetType === assetType && d.isEnabled)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.attrName.localeCompare(b.attrName));
    if (forSheet.length === 0) continue;

    result[sheet] = forSheet.map((d): FieldDef => ({
      key: `${EXT_FIELD_PREFIX}${d.attrCode}`,
      header: `[Custom] ${d.attrName}`,
      kind: "EDITABLE",
      type: mapDataType(d.dataType),
      enumValues: d.dataType === "ENUM" ? (d.enumValues ?? []) : undefined,
      maxLength: d.dataType === "LONGTEXT" ? 4000 : d.dataType === "TEXT" ? 500 : undefined,
    }));
  }
  return result;
}

export function customAttrAssetTypeForSheet(sheet: SheetName): CustomAttributeAssetType | null {
  return SHEET_TO_CUSTOM_ATTR_ASSET_TYPE[sheet] ?? null;
}
