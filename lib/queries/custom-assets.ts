import { sql } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttrDataType = "TEXT" | "LONGTEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "ENUM" | "USER" | "URL";

export type CustomAssetType = {
  typeId: number;
  typeCode: string;
  typeNameText: string;
  nameArText: string | null;
  descriptionText: string | null;
  iconCode: string | null;
  colorHex: string | null;
  isEnabled: boolean;
  instanceCount?: number;
};

export type CustomAssetTypeAttribute = {
  attrDefId: number;
  typeId: number;
  attrCode: string;
  attrNameText: string;
  nameArText: string | null;
  dataTypeCode: AttrDataType;
  enumValuesJson: string[] | null;
  isRequired: boolean;
  isUnique: boolean;
  displayOrder: number;
};

// Shape shared by both a type's attribute schema and a relationship type's
// optional attributes_schema_json — same field-descriptor convention throughout.
export type AttrFieldDef = {
  attr_code: string;
  attr_name_text: string;
  name_ar_text?: string | null;
  data_type_code: AttrDataType;
  enum_values_json?: string[] | null;
  is_required_indicator?: boolean;
};

export type CustomAsset = {
  customAssetId: number;
  typeId: number;
  assetNameText: string;
  nameArText: string | null;
  descriptionText: string | null;
  attributes: Record<string, unknown>;
  statusCode: "ACTIVE" | "DEPRECATED";
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomRelationshipType = {
  relTypeId: number;
  relCode: string;
  relNameText: string;
  nameArText: string | null;
  inverseNameText: string | null;
  inverseNameArText: string | null;
  fromEndpoints: string[];
  toEndpoints: string[];
  cardinalityCode: "M:N" | "1:N" | "N:1";
  attributesSchema: AttrFieldDef[] | null;
  isEnabled: boolean;
};

export type CustomAssetLink = {
  linkId: number;
  relTypeId: number;
  fromAssetTypeCode: string;
  fromAssetId: number;
  toAssetTypeCode: string;
  toAssetId: number;
  attributes: Record<string, unknown>;
  validFromDate: string | null;
  validToDate: string | null;
  createdAt: string;
};

// The 4 core asset types this feature can link to, alongside CUSTOM:<type_code>.
export const CORE_ASSET_TYPES = ["DATA_SOURCES", "DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"] as const;

// ── Types admin ──────────────────────────────────────────────────────────────

export async function getCustomAssetTypes(includeDisabled = false): Promise<CustomAssetType[]> {
  const rows = await sql<any[]>`
    SELECT t.type_id AS "typeId", t.type_code AS "typeCode", t.type_name_text AS "typeNameText",
           t.name_ar_text AS "nameArText", t.description_text AS "descriptionText",
           t.icon_code AS "iconCode", t.color_hex AS "colorHex", t.is_enabled_indicator AS "isEnabled",
           (SELECT count(*)::int FROM bayanat.custom_assets ca WHERE ca.type_id = t.type_id) AS "instanceCount"
    FROM bayanat.custom_asset_types t
    WHERE ${includeDisabled ? sql`true` : sql`t.is_enabled_indicator = true`}
    ORDER BY t.type_name_text
  `;
  return rows;
}

export async function getCustomAssetTypeByCode(typeCode: string): Promise<CustomAssetType | null> {
  const rows = await sql<any[]>`
    SELECT type_id AS "typeId", type_code AS "typeCode", type_name_text AS "typeNameText",
           name_ar_text AS "nameArText", description_text AS "descriptionText",
           icon_code AS "iconCode", color_hex AS "colorHex", is_enabled_indicator AS "isEnabled"
    FROM bayanat.custom_asset_types WHERE type_code = ${typeCode}
  `;
  return rows[0] ?? null;
}

export async function getTypeAttributes(typeId: number): Promise<CustomAssetTypeAttribute[]> {
  return sql<CustomAssetTypeAttribute[]>`
    SELECT attr_def_id AS "attrDefId", type_id AS "typeId", attr_code AS "attrCode",
           attr_name_text AS "attrNameText", name_ar_text AS "nameArText",
           data_type_code AS "dataTypeCode", enum_values_json AS "enumValuesJson",
           is_required_indicator AS "isRequired", is_unique_indicator AS "isUnique",
           display_order_int AS "displayOrder"
    FROM bayanat.custom_asset_type_attributes
    WHERE type_id = ${typeId}
    ORDER BY display_order_int, attr_def_id
  `;
}

export async function createCustomAssetType(data: {
  typeCode: string; typeNameText: string; nameArText: string | null; descriptionText: string | null;
  iconCode: string | null; colorHex: string | null; createdByUserId: string;
  attributes: AttrFieldDef[];
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.custom_asset_types (type_code, type_name_text, name_ar_text, description_text, icon_code, color_hex, created_by_user_id)
    VALUES (${data.typeCode}, ${data.typeNameText}, ${data.nameArText}, ${data.descriptionText}, ${data.iconCode}, ${data.colorHex}, ${data.createdByUserId})
    RETURNING type_id AS id
  `;
  const typeId = rows[0].id;
  let order = 1;
  for (const a of data.attributes) {
    await sql`
      INSERT INTO bayanat.custom_asset_type_attributes (type_id, attr_code, attr_name_text, name_ar_text, data_type_code, enum_values_json, is_required_indicator, is_unique_indicator, display_order_int)
      VALUES (${typeId}, ${a.attr_code}, ${a.attr_name_text}, ${a.name_ar_text ?? null}, ${a.data_type_code},
              ${(a.enum_values_json ?? null) as any}::jsonb, ${a.is_required_indicator ?? false}, false, ${order++})
    `;
  }
  return typeId;
}

export async function updateCustomAssetType(typeId: number, data: {
  typeNameText?: string; nameArText?: string | null; descriptionText?: string | null;
  iconCode?: string | null; colorHex?: string | null; isEnabled?: boolean;
}): Promise<void> {
  await sql`
    UPDATE bayanat.custom_asset_types SET
      type_name_text = COALESCE(${data.typeNameText ?? null}, type_name_text),
      name_ar_text = ${data.nameArText !== undefined ? data.nameArText : sql`name_ar_text`},
      description_text = ${data.descriptionText !== undefined ? data.descriptionText : sql`description_text`},
      icon_code = ${data.iconCode !== undefined ? data.iconCode : sql`icon_code`},
      color_hex = ${data.colorHex !== undefined ? data.colorHex : sql`color_hex`},
      is_enabled_indicator = COALESCE(${data.isEnabled ?? null}, is_enabled_indicator)
    WHERE type_id = ${typeId}
  `;
}

// Replaces the full attribute list for a type. Fields whose attr_code disappears
// but have populated data across existing instances are reported back so the
// caller (API route) can require an explicit confirm flag before proceeding —
// per FR-1.3, deleting a populated field needs confirmation and is audited.
export async function getAttributeCodesWithData(typeId: number, attrCodes: string[]): Promise<string[]> {
  if (attrCodes.length === 0) return [];
  const rows = await sql<{ attrCode: string }[]>`
    SELECT DISTINCT code AS "attrCode"
    FROM bayanat.custom_assets ca, jsonb_object_keys(ca.attributes_json) AS code
    WHERE ca.type_id = ${typeId} AND code = ANY(${attrCodes})
      AND ca.attributes_json ->> code IS NOT NULL AND ca.attributes_json ->> code <> ''
  `;
  return rows.map((r) => r.attrCode);
}

export async function replaceTypeAttributes(typeId: number, attributes: AttrFieldDef[]): Promise<void> {
  await sql`DELETE FROM bayanat.custom_asset_type_attributes WHERE type_id = ${typeId}`;
  let order = 1;
  for (const a of attributes) {
    await sql`
      INSERT INTO bayanat.custom_asset_type_attributes (type_id, attr_code, attr_name_text, name_ar_text, data_type_code, enum_values_json, is_required_indicator, is_unique_indicator, display_order_int)
      VALUES (${typeId}, ${a.attr_code}, ${a.attr_name_text}, ${a.name_ar_text ?? null}, ${a.data_type_code},
              ${(a.enum_values_json ?? null) as any}::jsonb, ${a.is_required_indicator ?? false}, false, ${order++})
    `;
  }
}

export async function canDeleteType(typeId: number): Promise<boolean> {
  const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM bayanat.custom_assets WHERE type_id = ${typeId}`;
  return (row?.count ?? 0) === 0;
}

// ── Relationship types admin ────────────────────────────────────────────────

export async function getRelationshipTypes(includeDisabled = false): Promise<CustomRelationshipType[]> {
  const rows = await sql<any[]>`
    SELECT rel_type_id AS "relTypeId", rel_code AS "relCode", rel_name_text AS "relNameText",
           name_ar_text AS "nameArText", inverse_name_text AS "inverseNameText", inverse_name_ar_text AS "inverseNameArText",
           from_endpoint_json AS "fromEndpoints", to_endpoint_json AS "toEndpoints",
           cardinality_code AS "cardinalityCode", attributes_schema_json AS "attributesSchema",
           is_enabled_indicator AS "isEnabled"
    FROM bayanat.custom_relationship_types
    WHERE ${includeDisabled ? sql`true` : sql`is_enabled_indicator = true`}
    ORDER BY rel_name_text
  `;
  return rows;
}

export async function getRelationshipTypeByCode(relCode: string): Promise<CustomRelationshipType | null> {
  const rows = await getRelationshipTypes(true);
  return rows.find((r) => r.relCode === relCode) ?? null;
}

// Relationship types where the given asset-type-code is a valid endpoint (either side).
export async function getRelationshipTypesForAssetType(assetTypeCode: string): Promise<CustomRelationshipType[]> {
  const all = await getRelationshipTypes(false);
  return all.filter((r) => r.fromEndpoints.includes(assetTypeCode) || r.toEndpoints.includes(assetTypeCode));
}

export async function createRelationshipType(data: {
  relCode: string; relNameText: string; nameArText: string | null;
  inverseNameText: string | null; inverseNameArText: string | null;
  fromEndpoints: string[]; toEndpoints: string[]; cardinalityCode: "M:N" | "1:N" | "N:1";
  attributesSchema: AttrFieldDef[] | null; createdByUserId: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.custom_relationship_types
      (rel_code, rel_name_text, name_ar_text, inverse_name_text, inverse_name_ar_text,
       from_endpoint_json, to_endpoint_json, cardinality_code, attributes_schema_json, created_by_user_id)
    VALUES (
      ${data.relCode}, ${data.relNameText}, ${data.nameArText}, ${data.inverseNameText}, ${data.inverseNameArText},
      ${data.fromEndpoints as any}::jsonb, ${data.toEndpoints as any}::jsonb, ${data.cardinalityCode},
      ${data.attributesSchema as any}::jsonb, ${data.createdByUserId}
    )
    RETURNING rel_type_id AS id
  `;
  return rows[0].id;
}

export async function updateRelationshipType(relTypeId: number, data: {
  relNameText?: string; nameArText?: string | null; inverseNameText?: string | null; inverseNameArText?: string | null;
  fromEndpoints?: string[]; toEndpoints?: string[]; cardinalityCode?: "M:N" | "1:N" | "N:1";
  attributesSchema?: AttrFieldDef[] | null; isEnabled?: boolean;
}): Promise<void> {
  await sql`
    UPDATE bayanat.custom_relationship_types SET
      rel_name_text = COALESCE(${data.relNameText ?? null}, rel_name_text),
      name_ar_text = ${data.nameArText !== undefined ? data.nameArText : sql`name_ar_text`},
      inverse_name_text = ${data.inverseNameText !== undefined ? data.inverseNameText : sql`inverse_name_text`},
      inverse_name_ar_text = ${data.inverseNameArText !== undefined ? data.inverseNameArText : sql`inverse_name_ar_text`},
      from_endpoint_json = ${data.fromEndpoints ? sql`${data.fromEndpoints as any}::jsonb` : sql`from_endpoint_json`},
      to_endpoint_json = ${data.toEndpoints ? sql`${data.toEndpoints as any}::jsonb` : sql`to_endpoint_json`},
      cardinality_code = COALESCE(${data.cardinalityCode ?? null}, cardinality_code),
      attributes_schema_json = ${data.attributesSchema !== undefined ? sql`${data.attributesSchema as any}::jsonb` : sql`attributes_schema_json`},
      is_enabled_indicator = COALESCE(${data.isEnabled ?? null}, is_enabled_indicator)
    WHERE rel_type_id = ${relTypeId}
  `;
}

// ── Instances ────────────────────────────────────────────────────────────────

export async function getInstances(typeId: number, opts: { search?: string; limit?: number; offset?: number } = {}): Promise<{ rows: CustomAsset[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const rows = await sql<any[]>`
    SELECT custom_asset_id AS "customAssetId", type_id AS "typeId", asset_name_text AS "assetNameText",
           name_ar_text AS "nameArText", description_text AS "descriptionText", attributes_json AS "attributes",
           status_code AS "statusCode", created_by_user_id AS "createdByUserId",
           created_at::text AS "createdAt", updated_at::text AS "updatedAt",
           count(*) OVER ()::int AS "totalCount"
    FROM bayanat.custom_assets
    WHERE type_id = ${typeId}
      AND (${opts.search ?? null}::text IS NULL OR asset_name_text ILIKE ${opts.search ? `%${opts.search}%` : null})
    ORDER BY asset_name_text
    LIMIT ${limit} OFFSET ${offset}
  `;
  const total = rows[0]?.totalCount ?? 0;
  return { total, rows: rows.map((r) => ({ ...r, totalCount: undefined })) };
}

export async function getInstance(customAssetId: number): Promise<CustomAsset | null> {
  const rows = await sql<any[]>`
    SELECT custom_asset_id AS "customAssetId", type_id AS "typeId", asset_name_text AS "assetNameText",
           name_ar_text AS "nameArText", description_text AS "descriptionText", attributes_json AS "attributes",
           status_code AS "statusCode", created_by_user_id AS "createdByUserId",
           created_at::text AS "createdAt", updated_at::text AS "updatedAt"
    FROM bayanat.custom_assets WHERE custom_asset_id = ${customAssetId}
  `;
  return rows[0] ?? null;
}

export type AttrValidationError = { attrCode: string; message: string };

export async function validateAttributes(
  typeId: number, attributes: Record<string, unknown>, excludeAssetId?: number,
): Promise<AttrValidationError[]> {
  const defs = await getTypeAttributes(typeId);
  const errors: AttrValidationError[] = [];

  for (const def of defs) {
    const value = attributes[def.attrCode];
    const isEmpty = value === undefined || value === null || value === "";

    if (def.isRequired && isEmpty) {
      errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} is required.` });
      continue;
    }
    if (isEmpty) continue;

    if (def.dataTypeCode === "NUMBER" && typeof value !== "number" && isNaN(Number(value))) {
      errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} must be a number.` });
    }
    if (def.dataTypeCode === "DATE" && isNaN(Date.parse(String(value)))) {
      errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} must be a valid date.` });
    }
    if (def.dataTypeCode === "ENUM" && def.enumValuesJson && !def.enumValuesJson.includes(String(value))) {
      errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} must be one of: ${def.enumValuesJson.join(", ")}.` });
    }
    if (def.dataTypeCode === "URL" && !/^https?:\/\//i.test(String(value))) {
      errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} must be a URL starting with http(s)://.` });
    }

    if (def.isUnique) {
      const rows = await sql<{ id: number }[]>`
        SELECT custom_asset_id AS id FROM bayanat.custom_assets
        WHERE type_id = ${typeId} AND attributes_json ->> ${def.attrCode} = ${String(value)}
          AND (${excludeAssetId ?? null}::int IS NULL OR custom_asset_id <> ${excludeAssetId ?? null})
      `;
      if (rows.length > 0) errors.push({ attrCode: def.attrCode, message: `${def.attrNameText} must be unique — "${value}" is already in use.` });
    }
  }
  return errors;
}

export async function createInstance(data: {
  typeId: number; assetNameText: string; nameArText: string | null; descriptionText: string | null;
  attributes: Record<string, unknown>; createdByUserId: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.custom_assets (type_id, asset_name_text, name_ar_text, description_text, attributes_json, created_by_user_id)
    VALUES (${data.typeId}, ${data.assetNameText}, ${data.nameArText}, ${data.descriptionText}, ${data.attributes as any}::jsonb, ${data.createdByUserId})
    RETURNING custom_asset_id AS id
  `;
  return rows[0].id;
}

export async function updateInstance(customAssetId: number, data: {
  assetNameText?: string; nameArText?: string | null; descriptionText?: string | null;
  attributes?: Record<string, unknown>; statusCode?: "ACTIVE" | "DEPRECATED";
}): Promise<void> {
  await sql`
    UPDATE bayanat.custom_assets SET
      asset_name_text = COALESCE(${data.assetNameText ?? null}, asset_name_text),
      name_ar_text = ${data.nameArText !== undefined ? data.nameArText : sql`name_ar_text`},
      description_text = ${data.descriptionText !== undefined ? data.descriptionText : sql`description_text`},
      attributes_json = ${data.attributes !== undefined ? sql`${data.attributes as any}::jsonb` : sql`attributes_json`},
      status_code = COALESCE(${data.statusCode ?? null}, status_code),
      updated_at = now()
    WHERE custom_asset_id = ${customAssetId}
  `;
}

// ── Links ────────────────────────────────────────────────────────────────────

export type LinkValidationResult = { ok: true } | { ok: false; reason: string };

export function validateLinkEndpoints(relType: CustomRelationshipType, fromType: string, toType: string): LinkValidationResult {
  if (!relType.fromEndpoints.includes(fromType)) {
    return { ok: false, reason: `${fromType} is not an allowed "from" endpoint for ${relType.relCode}.` };
  }
  if (!relType.toEndpoints.includes(toType)) {
    return { ok: false, reason: `${toType} is not an allowed "to" endpoint for ${relType.relCode}.` };
  }
  return { ok: true };
}

export async function createLink(data: {
  relTypeId: number; fromAssetTypeCode: string; fromAssetId: number;
  toAssetTypeCode: string; toAssetId: number; attributes: Record<string, unknown>;
  validFromDate: string | null; validToDate: string | null; createdByUserId: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.custom_asset_links
      (rel_type_id, from_asset_type_code, from_asset_id, to_asset_type_code, to_asset_id, attributes_json, valid_from_date, valid_to_date, created_by_user_id)
    VALUES (
      ${data.relTypeId}, ${data.fromAssetTypeCode}, ${data.fromAssetId}, ${data.toAssetTypeCode}, ${data.toAssetId},
      ${data.attributes as any}::jsonb, ${data.validFromDate}, ${data.validToDate}, ${data.createdByUserId}
    )
    ON CONFLICT (rel_type_id, from_asset_type_code, from_asset_id, to_asset_type_code, to_asset_id) DO NOTHING
    RETURNING link_id AS id
  `;
  return rows[0]?.id ?? 0;
}

export async function deleteLink(linkId: number): Promise<void> {
  await sql`DELETE FROM bayanat.custom_asset_links WHERE link_id = ${linkId}`;
}

export type ResolvedLink = {
  linkId: number;
  relTypeId: number;
  relCode: string;
  label: string;           // forward name or inverse name, whichever applies from the viewer's side
  direction: "OUT" | "IN";
  otherAssetTypeCode: string;
  otherAssetId: number;
  otherAssetName: string;
  otherAssetHref: string | null;
  attributes: Record<string, unknown>;
  validFromDate: string | null;
  validToDate: string | null;
};

// Resolves a display name + href for a core-or-custom asset reference. Batches by
// type so N links only cost one query per distinct type touched, not N queries.
export async function resolveAssetNames(refs: { typeCode: string; id: number }[]): Promise<Map<string, { name: string; href: string | null }>> {
  const out = new Map<string, { name: string; href: string | null }>();
  const byType = new Map<string, number[]>();
  for (const r of refs) {
    if (!byType.has(r.typeCode)) byType.set(r.typeCode, []);
    byType.get(r.typeCode)!.push(r.id);
  }

  for (const [typeCode, ids] of byType) {
    if (typeCode === "DATA_SOURCES") {
      const rows = await sql<{ id: number; name: string }[]>`
        SELECT data_source_id AS id, source_name_text AS name FROM bayanat.data_sources WHERE data_source_id = ANY(${ids})
      `;
      for (const r of rows) out.set(`${typeCode}:${r.id}`, { name: r.name, href: null });
    } else if (typeCode === "DATA_SCHEMAS") {
      const rows = await sql<{ id: number; name: string }[]>`
        SELECT schema_id AS id, schema_name_text AS name FROM bayanat.data_schemas WHERE schema_id = ANY(${ids})
      `;
      for (const r of rows) out.set(`${typeCode}:${r.id}`, { name: r.name, href: `/catalog/${r.id}` });
    } else if (typeCode === "DATA_ENTITIES") {
      const rows = await sql<{ id: number; name: string; schemaId: number }[]>`
        SELECT entity_id AS id, entity_name_text AS name, schema_id AS "schemaId" FROM bayanat.data_entities WHERE entity_id = ANY(${ids})
      `;
      for (const r of rows) out.set(`${typeCode}:${r.id}`, { name: r.name, href: `/catalog/${r.schemaId}/tables/${r.id}` });
    } else if (typeCode === "DATA_ATTRIBUTES") {
      const rows = await sql<{ id: number; name: string; entityId: number; schemaId: number }[]>`
        SELECT a.attribute_id AS id, a.physical_name_text AS name, a.entity_id AS "entityId", e.schema_id AS "schemaId"
        FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
        WHERE a.attribute_id = ANY(${ids})
      `;
      for (const r of rows) out.set(`${typeCode}:${r.id}`, { name: r.name, href: `/catalog/${r.schemaId}/tables/${r.entityId}` });
    } else if (typeCode.startsWith("CUSTOM:")) {
      const rows = await sql<{ id: number; name: string; typeCode: string }[]>`
        SELECT ca.custom_asset_id AS id, ca.asset_name_text AS name, t.type_code AS "typeCode"
        FROM bayanat.custom_assets ca JOIN bayanat.custom_asset_types t ON t.type_id = ca.type_id
        WHERE ca.custom_asset_id = ANY(${ids})
      `;
      for (const r of rows) out.set(`${typeCode}:${r.id}`, { name: r.name, href: `/assets/${r.typeCode.toLowerCase()}/${r.id}` });
    }
  }
  return out;
}

// ── Matrix view (deferred spec FR-3.4) ──────────────────────────────────────────

export type MatrixAxisItem = { typeCode: string; id: number; name: string; href: string | null };
export type RelationshipMatrix = {
  relType: CustomRelationshipType;
  rows: MatrixAxisItem[];
  cols: MatrixAxisItem[];
  cells: Record<string, Record<string, unknown> | null>; // key `${rowId}:${colId}`, null = linked with no attributes
};

// Lists every instance of a single core-or-custom asset type, for matrix axes.
// Only used here — getInstances()/resolveAssetNames() cover the id-keyed and
// single-lookup cases everywhere else in this file; this is "list them all."
export async function listInstancesOfType(typeCode: string): Promise<MatrixAxisItem[]> {
  if (typeCode === "DATA_SOURCES") {
    const rows = await sql<{ id: number; name: string }[]>`SELECT data_source_id AS id, source_name_text AS name FROM bayanat.data_sources ORDER BY source_name_text`;
    return rows.map((r) => ({ typeCode, id: r.id, name: r.name, href: null }));
  }
  if (typeCode === "DATA_SCHEMAS") {
    const rows = await sql<{ id: number; name: string }[]>`SELECT schema_id AS id, schema_name_text AS name FROM bayanat.data_schemas ORDER BY schema_name_text`;
    return rows.map((r) => ({ typeCode, id: r.id, name: r.name, href: `/catalog/${r.id}` }));
  }
  if (typeCode === "DATA_ENTITIES") {
    const rows = await sql<{ id: number; name: string; schemaId: number }[]>`SELECT entity_id AS id, entity_name_text AS name, schema_id AS "schemaId" FROM bayanat.data_entities ORDER BY entity_name_text`;
    return rows.map((r) => ({ typeCode, id: r.id, name: r.name, href: `/catalog/${r.schemaId}/tables/${r.id}` }));
  }
  if (typeCode === "DATA_ATTRIBUTES") {
    const rows = await sql<{ id: number; name: string; entityId: number; schemaId: number }[]>`
      SELECT a.attribute_id AS id, a.physical_name_text AS name, a.entity_id AS "entityId", e.schema_id AS "schemaId"
      FROM bayanat.data_attributes a JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
      ORDER BY a.physical_name_text
    `;
    return rows.map((r) => ({ typeCode, id: r.id, name: r.name, href: `/catalog/${r.schemaId}/tables/${r.entityId}` }));
  }
  if (typeCode.startsWith("CUSTOM:")) {
    const type = await getCustomAssetTypeByCode(typeCode.slice("CUSTOM:".length));
    if (!type) return [];
    const { rows } = await getInstances(type.typeId, { limit: 500 });
    return rows.map((r) => ({ typeCode, id: r.customAssetId, name: r.assetNameText, href: `/assets/${type.typeCode.toLowerCase()}/${r.customAssetId}` }));
  }
  return [];
}

// Only meaningful for M:N relationship types — a 1:N/N:1 grid degenerates to a
// list. Uses each side's first allowed endpoint type only; multi-type endpoint
// lists (e.g. a relationship allowing both DATA_ENTITIES and DATA_ATTRIBUTES on
// one side) aren't flattened into one matrix axis — an edge case none of the
// spec's driving scenarios need.
// `asOf` (defaults to today, matching the graph's default) filters out links whose
// valid_from_date/valid_to_date don't cover that date — AC-7's "a link with
// valid_to_date in the past disappears from default graph/matrix views and
// reappears with 'as of' set to a covered date" applies to the matrix too, not
// just the graph.
export async function getRelationshipMatrix(relTypeId: number, asOf?: string): Promise<RelationshipMatrix | null> {
  const relTypes = await getRelationshipTypes(true);
  const relType = relTypes.find((r) => r.relTypeId === relTypeId);
  if (!relType) return null;

  const fromType = relType.fromEndpoints[0];
  const toType = relType.toEndpoints[0];
  if (!fromType || !toType) return { relType, rows: [], cols: [], cells: {} };

  const [rows, cols] = await Promise.all([listInstancesOfType(fromType), listInstancesOfType(toType)]);

  const effectiveAsOf = asOf || new Date().toISOString().slice(0, 10);
  const linkRows = await sql<{ fromAssetId: number; toAssetId: number; attributes: Record<string, unknown> }[]>`
    SELECT from_asset_id AS "fromAssetId", to_asset_id AS "toAssetId", attributes_json AS attributes
    FROM bayanat.custom_asset_links
    WHERE rel_type_id = ${relTypeId} AND from_asset_type_code = ${fromType} AND to_asset_type_code = ${toType}
      AND (valid_from_date IS NULL OR valid_from_date <= ${effectiveAsOf}::date)
      AND (valid_to_date IS NULL OR valid_to_date >= ${effectiveAsOf}::date)
  `;
  const cells: Record<string, Record<string, unknown> | null> = {};
  for (const l of linkRows) {
    const key = `${l.fromAssetId}:${l.toAssetId}`;
    cells[key] = l.attributes && Object.keys(l.attributes).length > 0 ? l.attributes : null;
  }

  return { relType, rows, cols, cells };
}

export async function getLinksForAsset(assetTypeCode: string, assetId: number): Promise<ResolvedLink[]> {
  const relTypes = await getRelationshipTypes(true);
  const relById = new Map(relTypes.map((r) => [r.relTypeId, r]));

  const rows = await sql<any[]>`
    SELECT link_id AS "linkId", rel_type_id AS "relTypeId",
           from_asset_type_code AS "fromAssetTypeCode", from_asset_id AS "fromAssetId",
           to_asset_type_code AS "toAssetTypeCode", to_asset_id AS "toAssetId",
           attributes_json AS "attributes", valid_from_date::text AS "validFromDate", valid_to_date::text AS "validToDate"
    FROM bayanat.custom_asset_links
    WHERE (from_asset_type_code = ${assetTypeCode} AND from_asset_id = ${assetId})
       OR (to_asset_type_code = ${assetTypeCode} AND to_asset_id = ${assetId})
    ORDER BY link_id
  `;

  const otherRefs = rows.map((r) => {
    const isFrom = r.fromAssetTypeCode === assetTypeCode && r.fromAssetId === assetId;
    return isFrom
      ? { typeCode: r.toAssetTypeCode, id: r.toAssetId }
      : { typeCode: r.fromAssetTypeCode, id: r.fromAssetId };
  });
  const names = await resolveAssetNames(otherRefs);

  return rows.map((r): ResolvedLink | null => {
    const relType = relById.get(r.relTypeId);
    if (!relType) return null;
    const isFrom = r.fromAssetTypeCode === assetTypeCode && r.fromAssetId === assetId;
    const otherTypeCode = isFrom ? r.toAssetTypeCode : r.fromAssetTypeCode;
    const otherId = isFrom ? r.toAssetId : r.fromAssetId;
    const other = names.get(`${otherTypeCode}:${otherId}`);
    return {
      linkId: r.linkId, relTypeId: r.relTypeId, relCode: relType.relCode,
      label: isFrom ? relType.relNameText : (relType.inverseNameText ?? relType.relNameText),
      direction: isFrom ? "OUT" : "IN",
      otherAssetTypeCode: otherTypeCode, otherAssetId: otherId,
      otherAssetName: other?.name ?? `#${otherId}`, otherAssetHref: other?.href ?? null,
      attributes: r.attributes, validFromDate: r.validFromDate, validToDate: r.validToDate,
    };
  }).filter((x): x is ResolvedLink => x !== null);
}
