// Bulk Download/Upload — single source of truth for sheet column layout (spec §2.2).
// Both the workbook writer (download) and reader (upload) import this so headers,
// column kinds, and field keys never drift apart between generation and parsing.
// The reader matches columns by HEADER TEXT, not position, so a user reordering
// columns in Excel doesn't break the round-trip.

export type SheetName = "DataSources" | "Tables" | "Columns" | "BusinessTerms";
export type FieldKind = "SYSTEM" | "EDITABLE" | "REFERENCE";
export type FieldType = "TEXT" | "LONGTEXT" | "ENUM" | "BOOLEAN" | "TAGS" | "TERM" | "NUMBER";
export type EnumSource = "TABLE_CATEGORY" | "COLUMN_TYPE" | "CLASSIFICATION" | "PI_CATEGORY";

export type FieldDef = {
  key: string;
  header: string;
  kind: FieldKind;
  type: FieldType;
  enumSource?: EnumSource;
  maxLength?: number;
};

// Extended/custom attributes (spec §2.3, `ext:<code>` columns) would be appended here
// per-sheet at export time by reading a registry of custom-field definitions — no such
// registry exists anywhere in this codebase today (confirmed: the table page's "Custom
// Properties" tab is a UI-only placeholder with no backing schema). This hook always
// returns an empty list until that system exists; the workbook writer/reader already
// handle an empty extended-attribute list correctly, so nothing else needs to change
// when it eventually does.
export function getExtendedAttributeFields(_sheet: SheetName): FieldDef[] {
  return [];
}

const SYS: (key: string, header: string) => FieldDef = (key, header) => ({ key, header, kind: "SYSTEM", type: "TEXT" });
const REF = (key: string, header: string, type: FieldType = "TEXT"): FieldDef => ({ key, header, kind: "REFERENCE", type });

export const DATA_SOURCES_FIELDS: FieldDef[] = [
  SYS("_ID", "_ID"), SYS("_TYPE", "_TYPE"),
  SYS("sourceName", "Source Name"), SYS("sourceType", "Source Type"),
  { key: "description", header: "Description", kind: "EDITABLE", type: "LONGTEXT", maxLength: 2000 },
  { key: "businessAppName", header: "Business App Name", kind: "EDITABLE", type: "TEXT", maxLength: 200 },
  REF("schemaCount", "Schema Count", "NUMBER"), REF("tableCount", "Table Count", "NUMBER"),
];

export const TABLES_FIELDS: FieldDef[] = [
  SYS("_ID", "_ID"), SYS("_TYPE", "_TYPE"),
  SYS("sourceName", "Source"), SYS("schemaName", "Schema"), SYS("tableName", "Table Name"),
  { key: "friendlyName", header: "Friendly Name", kind: "EDITABLE", type: "TEXT", maxLength: 255 },
  { key: "description", header: "Description", kind: "EDITABLE", type: "LONGTEXT", maxLength: 2000 },
  { key: "category", header: "Table Category", kind: "EDITABLE", type: "ENUM", enumSource: "TABLE_CATEGORY" },
  { key: "tags", header: "Tags", kind: "EDITABLE", type: "TAGS" },
  REF("isView", "Is View", "BOOLEAN"), REF("rowCount", "Row Count", "NUMBER"),
  REF("dqRuleCount", "DQ Rule Count", "NUMBER"), REF("trustScore", "Trust Score", "NUMBER"),
];

export const COLUMNS_FIELDS: FieldDef[] = [
  SYS("_ID", "_ID"), SYS("_TYPE", "_TYPE"),
  SYS("sourceName", "Source"), SYS("schemaName", "Schema"), SYS("tableName", "Table"),
  SYS("columnName", "Column Name"), SYS("dataType", "Data Type"),
  { key: "friendlyName", header: "Friendly Name", kind: "EDITABLE", type: "TEXT", maxLength: 255 },
  { key: "description", header: "Description", kind: "EDITABLE", type: "LONGTEXT", maxLength: 2000 },
  { key: "columnType", header: "Column Type", kind: "EDITABLE", type: "ENUM", enumSource: "COLUMN_TYPE" },
  { key: "glossaryTerm", header: "Glossary Term", kind: "EDITABLE", type: "TERM" },
  { key: "isEncrypted", header: "Is Encrypted", kind: "EDITABLE", type: "BOOLEAN" },
  { key: "tags", header: "Tags", kind: "EDITABLE", type: "TAGS" },
  REF("isPrimaryKey", "Is PK", "BOOLEAN"), REF("isNullable", "Is Nullable", "BOOLEAN"),
  REF("dqRuleCount", "DQ Rule Count", "NUMBER"), REF("qualityScore", "Quality Score", "NUMBER"),
  REF("nullPct", "Null %", "NUMBER"),
];

export const BUSINESS_TERMS_FIELDS: FieldDef[] = [
  SYS("_ID", "_ID"), SYS("_TYPE", "_TYPE"),
  { key: "termName", header: "Term Name", kind: "EDITABLE", type: "TEXT", maxLength: 255 },
  { key: "domainName", header: "Domain", kind: "EDITABLE", type: "TEXT" },
  { key: "definition", header: "Definition", kind: "EDITABLE", type: "LONGTEXT", maxLength: 4000 },
  { key: "classification", header: "Classification", kind: "EDITABLE", type: "ENUM", enumSource: "CLASSIFICATION" },
  { key: "isPii", header: "Is PII", kind: "EDITABLE", type: "BOOLEAN" },
  { key: "piCategory", header: "PI Category", kind: "EDITABLE", type: "ENUM", enumSource: "PI_CATEGORY" },
  { key: "format", header: "Format", kind: "EDITABLE", type: "TEXT", maxLength: 200 },
  { key: "businessRules", header: "Business Rules", kind: "EDITABLE", type: "LONGTEXT", maxLength: 2000 },
  { key: "example", header: "Example", kind: "EDITABLE", type: "TEXT", maxLength: 500 },
];

export function getFieldsForSheet(sheet: SheetName): FieldDef[] {
  const base =
    sheet === "DataSources" ? DATA_SOURCES_FIELDS :
    sheet === "Tables" ? TABLES_FIELDS :
    sheet === "Columns" ? COLUMNS_FIELDS :
    BUSINESS_TERMS_FIELDS;
  return [...base, ...getExtendedAttributeFields(sheet)];
}

export const SHEET_ASSET_TYPE: Record<SheetName, string> = {
  DataSources: "DATA_SOURCES",
  Tables: "DATA_ENTITIES",
  Columns: "DATA_ATTRIBUTES",
  BusinessTerms: "BUSINESS_TERMS",
};

export const ROW_CAP_PER_FILE = 50_000;
export const CLEAR_SENTINEL = "<CLEAR>";
export const TEMPLATE_SCHEMA_VERSION = 1;
