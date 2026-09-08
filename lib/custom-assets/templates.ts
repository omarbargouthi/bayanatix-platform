// Custom Asset Framework — shipped templates (deferred spec §7). Declarative
// type + relationship-type definitions, installed via the existing
// createCustomAssetType/createRelationshipType (the same functions the admin UI
// itself calls) — a template install is just pre-filled admin actions, nothing
// installs is special or uneditable afterward, matching the spec's "Templates are
// seed data only — everything they create is editable like hand-made types."

import {
  getCustomAssetTypeByCode, getRelationshipTypeByCode, createCustomAssetType, createRelationshipType,
  getTypeAttributes, type AttrFieldDef,
} from "../queries/custom-assets";
import { upsertKey, type Counters } from "../i18n-admin/translatable-fields";

// Templates install with real, curated Arabic content (not placeholders), but
// createCustomAssetType/createRelationshipType no longer accept nameArText —
// name_ar_text columns were dropped from the runtime read path in favor of
// translation_keys/translations (see translated-column.ts). So a template
// install seeds that Arabic directly as a VERIFIED translation, using the same
// key_code convention (custom_asset_types.{id}.name, etc.) the regular sync
// uses — the seed content ends up exactly where an admin's own Workbench edit
// would have put it, just pre-filled instead of MISSING.
function seedCounters(): Counters {
  return { keysCreated: 0, keysUpdatedStale: 0, secondarySeeded: 0 };
}

export type TemplateTypeDef = {
  typeCode: string; typeNameText: string; nameArText: string | null; descriptionText: string | null;
  iconCode: string | null; colorHex: string | null; attributes: AttrFieldDef[];
};
export type TemplateRelDef = {
  relCode: string; relNameText: string; nameArText: string | null;
  inverseNameText: string | null; inverseNameArText: string | null;
  fromEndpoints: string[]; toEndpoints: string[]; cardinalityCode: "M:N" | "1:N" | "N:1";
  attributesSchema: AttrFieldDef[] | null;
};
export type TemplateDescriptor = {
  code: string; name: string; description: string;
  types: TemplateTypeDef[]; relationshipTypes: TemplateRelDef[];
};

export const TEMPLATES: Record<string, TemplateDescriptor> = {
  // Already seeded by the Custom Asset Framework's Foundation Pass migration
  // (db/072_custom_assets.sql) — included here only so the Templates admin UI can
  // detect and display it as "Installed" alongside the other two.
  B2B_CONSUMPTION: {
    code: "B2B_CONSUMPTION", name: "B2B Consumption",
    description: "Customer type + CONSUMES relationship to Data Source — matrix of which external customer accesses which source system.",
    types: [{
      typeCode: "CUSTOMER", typeNameText: "Customer", nameArText: "عميل",
      descriptionText: "External customer or consumer of a data source.", iconCode: "building", colorHex: "#6058A0",
      attributes: [
        { attr_code: "CR_NUMBER", attr_name_text: "CR Number", name_ar_text: "رقم السجل التجاري", data_type_code: "TEXT", is_required_indicator: true },
        { attr_code: "SECTOR", attr_name_text: "Sector", name_ar_text: "القطاع", data_type_code: "ENUM", enum_values_json: ["Government", "Banking", "Retail", "Healthcare", "Other"], is_required_indicator: true },
        { attr_code: "CONTACT", attr_name_text: "Contact", name_ar_text: "جهة الاتصال", data_type_code: "TEXT" },
      ],
    }],
    relationshipTypes: [{
      relCode: "CONSUMES", relNameText: "Consumes", nameArText: "يستهلك", inverseNameText: "Consumed by", inverseNameArText: "يُستهلك من قبل",
      fromEndpoints: ["CUSTOM:CUSTOMER"], toEndpoints: ["DATA_SOURCES"], cardinalityCode: "M:N",
      attributesSchema: [{ attr_code: "ACCESS_LEVEL", attr_name_text: "Access Level", data_type_code: "ENUM", enum_values_json: ["READ", "WRITE"] }],
    }],
  },

  PI_ACCESS_MAP: {
    code: "PI_ACCESS_MAP", name: "PI Access Map",
    description: "Role type + HAS_ACCESS_TO relationship to Columns — visualize how personal-data columns are exposed by role.",
    types: [{
      typeCode: "ROLE", typeNameText: "Role", nameArText: "دور",
      descriptionText: "An organizational role that may be granted access to personal-data columns.", iconCode: "user", colorHex: "#2563eb",
      attributes: [
        { attr_code: "DEPARTMENT", attr_name_text: "Department", name_ar_text: "القسم", data_type_code: "TEXT" },
        { attr_code: "JOB_FAMILY", attr_name_text: "Job Family", name_ar_text: "الفئة الوظيفية", data_type_code: "TEXT" },
      ],
    }],
    relationshipTypes: [{
      relCode: "HAS_ACCESS_TO", relNameText: "Has Access To", nameArText: "لديه صلاحية الوصول إلى",
      inverseNameText: "Accessed by", inverseNameArText: "يُستخدم من قبل",
      fromEndpoints: ["CUSTOM:ROLE"], toEndpoints: ["DATA_ATTRIBUTES"], cardinalityCode: "M:N",
      attributesSchema: [
        { attr_code: "ACCESS_LEVEL", attr_name_text: "Access Level", data_type_code: "ENUM", enum_values_json: ["READ", "WRITE"] },
        { attr_code: "GRANTED_DATE", attr_name_text: "Granted Date", data_type_code: "DATE" },
      ],
    }],
  },

  ROPA_LITE: {
    code: "ROPA_LITE", name: "Processing Activities (RoPA-lite)",
    description: "Activity type linked to a Role, PI-flagged Columns, and a Data Source — a lightweight Records-of-Processing view feeding the \"PI Access by Role\" report.",
    types: [{
      typeCode: "ACTIVITY", typeNameText: "Activity", nameArText: "نشاط",
      descriptionText: "A data-processing activity performed by a role.", iconCode: "activity", colorHex: "#d97706",
      attributes: [
        { attr_code: "PURPOSE", attr_name_text: "Purpose", name_ar_text: "الغرض", data_type_code: "TEXT" },
        { attr_code: "LEGAL_BASIS", attr_name_text: "Legal Basis", name_ar_text: "الأساس القانوني", data_type_code: "ENUM", enum_values_json: ["CONSENT", "CONTRACT", "LEGAL_OBLIGATION", "LEGITIMATE_INTEREST"] },
        { attr_code: "FREQUENCY", attr_name_text: "Frequency", name_ar_text: "التكرار", data_type_code: "TEXT" },
      ],
    }],
    relationshipTypes: [
      {
        relCode: "PERFORMED_BY", relNameText: "Performed By", nameArText: "يُنفذ من قبل",
        inverseNameText: "Performs", inverseNameArText: "ينفذ",
        fromEndpoints: ["CUSTOM:ACTIVITY"], toEndpoints: ["CUSTOM:ROLE"], cardinalityCode: "N:1", attributesSchema: null,
      },
      {
        relCode: "USES_DATA", relNameText: "Uses Data", nameArText: "يستخدم بيانات",
        inverseNameText: "Used by", inverseNameArText: "تُستخدم من قبل",
        fromEndpoints: ["CUSTOM:ACTIVITY"], toEndpoints: ["DATA_ATTRIBUTES"], cardinalityCode: "M:N", attributesSchema: null,
      },
      {
        relCode: "WITHIN_SOURCE", relNameText: "Within Source", nameArText: "ضمن مصدر",
        inverseNameText: "Hosts activity", inverseNameArText: "يستضيف نشاط",
        fromEndpoints: ["CUSTOM:ACTIVITY"], toEndpoints: ["DATA_SOURCES"], cardinalityCode: "N:1", attributesSchema: null,
      },
    ],
  },
};

export type TemplateStatus = { code: string; name: string; description: string; installed: boolean };

export async function getTemplateStatuses(): Promise<TemplateStatus[]> {
  const results: TemplateStatus[] = [];
  for (const tpl of Object.values(TEMPLATES)) {
    let installed = true;
    for (const t of tpl.types) {
      if (!(await getCustomAssetTypeByCode(t.typeCode))) { installed = false; break; }
    }
    if (installed) {
      for (const r of tpl.relationshipTypes) {
        if (!(await getRelationshipTypeByCode(r.relCode))) { installed = false; break; }
      }
    }
    results.push({ code: tpl.code, name: tpl.name, description: tpl.description, installed });
  }
  return results;
}

export async function installTemplate(templateCode: string, userId: string): Promise<{ createdTypes: string[]; createdRelationshipTypes: string[]; skipped: string[] }> {
  const tpl = TEMPLATES[templateCode];
  if (!tpl) throw new Error(`Unknown template "${templateCode}"`);

  const createdTypes: string[] = [];
  const createdRelationshipTypes: string[] = [];
  const skipped: string[] = [];

  const counters = seedCounters();

  for (const t of tpl.types) {
    const existing = await getCustomAssetTypeByCode(t.typeCode);
    if (existing) { skipped.push(`Type ${t.typeCode} (already exists)`); continue; }
    const typeId = await createCustomAssetType({
      typeCode: t.typeCode, typeNameText: t.typeNameText, descriptionText: t.descriptionText,
      iconCode: t.iconCode, colorHex: t.colorHex, createdByUserId: userId, attributes: t.attributes,
    });
    await upsertKey(counters, "CUSTOM_ASSET_TYPES", `custom_asset_types.${typeId}.name`, t.typeNameText, "en", "ar", t.nameArText);

    const createdAttrs = await getTypeAttributes(typeId);
    for (const a of t.attributes) {
      const attrDef = createdAttrs.find((c) => c.attrCode === a.attr_code);
      if (attrDef && a.name_ar_text) {
        await upsertKey(counters, "CUSTOM_ASSET_ATTRS", `custom_asset_attrs.${attrDef.attrDefId}.name`, a.attr_name_text, "en", "ar", a.name_ar_text);
      }
    }
    createdTypes.push(t.typeCode);
  }

  for (const r of tpl.relationshipTypes) {
    const existing = await getRelationshipTypeByCode(r.relCode);
    if (existing) { skipped.push(`Relationship ${r.relCode} (already exists)`); continue; }
    const relTypeId = await createRelationshipType({
      relCode: r.relCode, relNameText: r.relNameText,
      inverseNameText: r.inverseNameText,
      fromEndpoints: r.fromEndpoints, toEndpoints: r.toEndpoints, cardinalityCode: r.cardinalityCode,
      attributesSchema: r.attributesSchema, createdByUserId: userId,
    });
    await upsertKey(counters, "CUSTOM_RELATIONSHIP_TYPES", `custom_relationship_types.${relTypeId}.name`, r.relNameText, "en", "ar", r.nameArText);
    if (r.inverseNameText) {
      await upsertKey(counters, "CUSTOM_RELATIONSHIP_TYPES", `custom_relationship_types.${relTypeId}.inverse_name`, r.inverseNameText, "en", "ar", r.inverseNameArText);
    }
    createdRelationshipTypes.push(r.relCode);
  }

  return { createdTypes, createdRelationshipTypes, skipped };
}
