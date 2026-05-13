/**
 * DQ template definitions — safe to import in both server and client components.
 * No database imports here.
 */

export const DQ_TEMPLATES = [
  {
    code: "NOT_NULL",
    label: "Not Null",
    description: "Checks that a column has no null values.",
    dimension: "COMP",
    assetType: "column",
    configFields: [] as { key: string; label: string; type: string; default: unknown }[],
  },
  {
    code: "COMPLETENESS_RATE",
    label: "Completeness Rate",
    description: "Fails if null percentage exceeds the configured threshold.",
    dimension: "COMP",
    assetType: "column",
    configFields: [{ key: "max_null_pct", label: "Max Null %", type: "number", default: 5 }],
  },
  {
    code: "REGEX_MATCH",
    label: "Regex Pattern Match",
    description: "Validates column values against a regular expression.",
    dimension: "VALIDITY",
    assetType: "column",
    configFields: [{ key: "pattern", label: "Regex Pattern", type: "text", default: "" }],
  },
  {
    code: "VALUE_IN_LIST",
    label: "Value in List",
    description: "Checks column values are within an allowed set.",
    dimension: "VALIDITY",
    assetType: "column",
    configFields: [{ key: "allowed_values", label: "Allowed Values (comma-separated)", type: "text", default: "" }],
  },
  {
    code: "RANGE_CHECK",
    label: "Numeric Range Check",
    description: "Validates numeric column values fall within min/max bounds.",
    dimension: "VALIDITY",
    assetType: "column",
    configFields: [
      { key: "min_value", label: "Min Value", type: "number", default: null as null },
      { key: "max_value", label: "Max Value", type: "number", default: null as null },
    ],
  },
  {
    code: "UNIQUE",
    label: "Uniqueness Check",
    description: "Checks for duplicate values in a column.",
    dimension: "UNIQUENESS",
    assetType: "column",
    configFields: [] as { key: string; label: string; type: string; default: unknown }[],
  },
  {
    code: "ROW_COUNT_THRESHOLD",
    label: "Row Count Threshold",
    description: "Fails if table row count drops below minimum.",
    dimension: "COMP",
    assetType: "table",
    configFields: [{ key: "min_rows", label: "Minimum Row Count", type: "number", default: 100 }],
  },
  {
    code: "FRESHNESS_CHECK",
    label: "Freshness / Timeliness",
    description: "Checks that a date column has recent values within configured hours.",
    dimension: "FRESHNESS",
    assetType: "column",
    configFields: [{ key: "max_age_hours", label: "Max Age (hours)", type: "number", default: 24 }],
  },
  {
    code: "REFERENTIAL_CHECK",
    label: "Referential Integrity",
    description: "Verifies FK values exist in the referenced table.",
    dimension: "CONSISTENCY",
    assetType: "column",
    configFields: [
      { key: "ref_table",  label: "Reference Table",  type: "text", default: "" },
      { key: "ref_column", label: "Reference Column", type: "text", default: "" },
    ],
  },
  {
    code: "CUSTOM_SQL",
    label: "Custom SQL",
    description: "Run a custom SQL expression. Must return total_rows and failed_rows.",
    dimension: null as null,
    assetType: "any",
    configFields: [] as { key: string; label: string; type: string; default: unknown }[],
  },
] as const;

export type TemplateCode = typeof DQ_TEMPLATES[number]["code"];

/**
 * Converts raw string form values into properly-typed config for storage.
 * Empty strings are omitted. Numbers are parsed. Text fields are kept as-is.
 */
export function buildRuleConfig(
  rawConfig: Record<string, string>,
  templateCode: string
): Record<string, unknown> {
  const template = DQ_TEMPLATES.find((t) => t.code === templateCode);
  if (!template) return {};
  const result: Record<string, unknown> = {};
  for (const field of template.configFields as { key: string; type: string }[]) {
    const raw = rawConfig[field.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (field.type === "number") {
      const n = Number(raw);
      if (!isNaN(n)) result[field.key] = n;
    } else {
      result[field.key] = raw;
    }
  }
  return result;
}
