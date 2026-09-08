// Custom Attributes — admin-defined metadata fields on the native catalog
// asset types (column / table / schema / data source / business term), plus
// the per-asset-instance values for them. See db/090_custom_attributes.sql.

import { sql } from "../db";
import type { CustomAttributeDefinition, CustomAttributeAssetType } from "../types";
import { translatedColumnSql } from "../i18n-admin/translated-column";

const DEF_COLS = `
  attr_def_id      AS "attrDefId",
  asset_type_code  AS "assetType",
  attr_code        AS "attrCode",
  attr_name_text   AS "attrName",
  data_type_code   AS "dataType",
  enum_values_json AS "enumValues",
  is_required_indicator AS "isRequired",
  is_enabled_indicator  AS "isEnabled",
  display_order_int     AS "displayOrder",
  ${translatedColumnSql(`'custom_attributes.' || custom_attribute_definitions.attr_def_id || '.name'`, "nameTranslations")}
`;

export async function listAllCustomAttributeDefinitions(): Promise<CustomAttributeDefinition[]> {
  return sql<CustomAttributeDefinition[]>`
    SELECT ${sql.unsafe(DEF_COLS)} FROM bayanat.custom_attribute_definitions
    ORDER BY asset_type_code, display_order_int, attr_name_text
  `;
}

export async function listCustomAttributeDefinitions(assetType: CustomAttributeAssetType): Promise<CustomAttributeDefinition[]> {
  return sql<CustomAttributeDefinition[]>`
    SELECT ${sql.unsafe(DEF_COLS)} FROM bayanat.custom_attribute_definitions
    WHERE asset_type_code = ${assetType} AND is_enabled_indicator = true
    ORDER BY display_order_int, attr_name_text
  `;
}

export async function createCustomAttributeDefinition(input: {
  assetType: CustomAttributeAssetType; attrCode: string; attrName: string;
  dataType: string; enumValues: string[] | null; isRequired: boolean; displayOrder: number; userId: string;
}): Promise<number> {
  const [row] = await sql<{ attrDefId: number }[]>`
    INSERT INTO bayanat.custom_attribute_definitions
      (asset_type_code, attr_code, attr_name_text, data_type_code, enum_values_json,
       is_required_indicator, display_order_int, created_by_user_id)
    VALUES (${input.assetType}, ${input.attrCode}, ${input.attrName},
            ${input.dataType}, ${sql.json(input.enumValues ?? null)},
            ${input.isRequired}, ${input.displayOrder}, ${input.userId})
    RETURNING attr_def_id AS "attrDefId"
  `;
  return row.attrDefId;
}

export async function updateCustomAttributeDefinition(attrDefId: number, patch: {
  attrName?: string; enumValues?: string[] | null;
  isRequired?: boolean; isEnabled?: boolean; displayOrder?: number;
}): Promise<void> {
  await sql`
    UPDATE bayanat.custom_attribute_definitions SET
      attr_name_text         = COALESCE(${patch.attrName ?? null}, attr_name_text),
      enum_values_json        = CASE WHEN ${patch.enumValues !== undefined} THEN ${sql.json(patch.enumValues ?? null)} ELSE enum_values_json END,
      is_required_indicator  = COALESCE(${patch.isRequired ?? null}, is_required_indicator),
      is_enabled_indicator   = COALESCE(${patch.isEnabled ?? null}, is_enabled_indicator),
      display_order_int      = COALESCE(${patch.displayOrder ?? null}, display_order_int)
    WHERE attr_def_id = ${attrDefId}
  `;
}

export async function deleteCustomAttributeDefinition(attrDefId: number): Promise<void> {
  await sql`DELETE FROM bayanat.custom_attribute_definitions WHERE attr_def_id = ${attrDefId}`;
}

export async function getCustomAttributeValues(
  assetType: CustomAttributeAssetType, assetId: number,
): Promise<{ definitions: CustomAttributeDefinition[]; values: Record<string, unknown> }> {
  const [definitions, [row]] = await Promise.all([
    listCustomAttributeDefinitions(assetType),
    sql<{ valuesJson: Record<string, unknown> }[]>`
      SELECT values_json AS "valuesJson" FROM bayanat.custom_attribute_values
      WHERE asset_type_code = ${assetType} AND asset_id = ${assetId}
    `,
  ]);
  return { definitions, values: row?.valuesJson ?? {} };
}

export async function saveCustomAttributeValues(
  assetType: CustomAttributeAssetType, assetId: number,
  values: Record<string, string | number | boolean | null>, userId: string,
): Promise<void> {
  await sql`
    INSERT INTO bayanat.custom_attribute_values (asset_type_code, asset_id, values_json, updated_by_user_id)
    VALUES (${assetType}, ${assetId}, ${sql.json(values)}, ${userId})
    ON CONFLICT (asset_type_code, asset_id) DO UPDATE SET
      values_json = EXCLUDED.values_json, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()
  `;
}
