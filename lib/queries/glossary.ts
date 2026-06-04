import { sql } from "../db";
import { logUpdate } from "../audit";
import type { GlossaryDomain, GlossaryTerm, GlossaryTermDetail, GlossaryAlias } from "../types";

export type GlossaryStats = {
  totalTerms:   number;
  domains:      number;
  linkedAttrs:  number;
  piiTerms:     number;
};

export async function getGlossaryStats(): Promise<GlossaryStats> {
  const rows = await sql<{ totalTerms: string; domains: string; linkedAttrs: string; piiTerms: string }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM bayanat.business_glossaries WHERE parent_glossary_id IS NOT NULL) AS "totalTerms",
      (SELECT COUNT(*)::int FROM bayanat.business_glossaries WHERE parent_glossary_id IS NULL)     AS "domains",
      (SELECT COUNT(DISTINCT a.glossary_term_text)
         FROM bayanat.data_attributes a
         WHERE a.glossary_term_text IS NOT NULL)                                                   AS "linkedAttrs",
      (SELECT COUNT(*)::int FROM bayanat.business_glossaries
         WHERE parent_glossary_id IS NOT NULL AND is_pii_indicator = TRUE)                        AS "piiTerms"
  `;
  const r = rows[0];
  return {
    totalTerms:  Number(r.totalTerms),
    domains:     Number(r.domains),
    linkedAttrs: Number(r.linkedAttrs),
    piiTerms:    Number(r.piiTerms),
  };
}

export async function getGlossaryDomains(): Promise<GlossaryDomain[]> {
  return sql<GlossaryDomain[]>`
    SELECT
      g.glossary_id    AS "glossaryId",
      g.term_name_text AS "termName",
      g.definition_text AS "description",
      g.classification_code AS "classCode",
      (SELECT COUNT(*)::int FROM bayanat.business_glossaries c
         WHERE c.parent_glossary_id = g.glossary_id) AS "termCount"
    FROM bayanat.business_glossaries g
    WHERE g.parent_glossary_id IS NULL
    ORDER BY g.term_name_text
  `;
}

export async function getGlossaryTerms(domainId?: number): Promise<GlossaryTerm[]> {
  return sql<GlossaryTerm[]>`
    SELECT
      g.glossary_id           AS "glossaryId",
      g.term_name_text        AS "termName",
      g.definition_text       AS "definition",
      g.classification_code   AS "classCode",
      g.is_pii_indicator      AS "isPii",
      p.term_name_text        AS "domainName",
      p.glossary_id           AS "domainId",
      (SELECT COUNT(*)::int FROM bayanat.glossary_aliases a WHERE a.glossary_id = g.glossary_id) AS "aliasCount",
      (SELECT COUNT(*)::int FROM bayanat.data_attributes da WHERE da.glossary_term_text = g.term_name_text) AS "linkedAttrCount",
      g.created_at_timestamp  AS "createdAt"
    FROM bayanat.business_glossaries g
    LEFT JOIN bayanat.business_glossaries p ON p.glossary_id = g.parent_glossary_id
    WHERE g.parent_glossary_id IS NOT NULL
      ${domainId ? sql`AND g.parent_glossary_id = ${domainId}` : sql``}
    ORDER BY p.term_name_text, g.term_name_text
  `;
}

export async function getGlossaryTermById(id: number): Promise<GlossaryTermDetail | null> {
  const rows = await sql<{
    glossaryId:            number;
    termName:              string;
    definition:            string;
    businessRules:         string | null;
    format:                string | null;
    example:               string | null;
    classCode:             string | null;
    isPii:                 boolean;
    piCategory:            string | null;
    npiCategory:           string | null;
    termType:              string | null;
    domainName:            string | null;
    domainId:              number | null;
    createdAt:             string;
    retentionCategoryId:   number | null;
    retentionCategoryName: string | null;
  }[]>`
    SELECT
      g.glossary_id            AS "glossaryId",
      g.term_name_text         AS "termName",
      g.definition_text        AS "definition",
      g.business_rules_text    AS "businessRules",
      g.format_text            AS "format",
      g.example_text           AS "example",
      g.classification_code    AS "classCode",
      g.is_pii_indicator       AS "isPii",
      g.pi_category_code       AS "piCategory",
      g.npi_category_code      AS "npiCategory",
      g.term_type              AS "termType",
      p.term_name_text         AS "domainName",
      p.glossary_id            AS "domainId",
      g.created_at_timestamp   AS "createdAt",
      g.retention_category_id  AS "retentionCategoryId",
      dc.name                  AS "retentionCategoryName"
    FROM bayanat.business_glossaries g
    LEFT JOIN bayanat.business_glossaries p  ON p.glossary_id  = g.parent_glossary_id
    LEFT JOIN bayanat.data_categories    dc  ON dc.category_id = g.retention_category_id
    WHERE g.glossary_id = ${id}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const term = rows[0];

  const aliasRows = await sql<{ aliasId: number; alias: string }[]>`
    SELECT alias_id AS "aliasId", alias_name_text AS alias
    FROM bayanat.glossary_aliases
    WHERE glossary_id = ${id}
    ORDER BY alias_name_text
  `;

  const attrRows = await sql<{
    attributeId:  number;
    physicalName: string;
    friendlyName: string | null;
    dataType:     string;
    entityName:   string;
    entityId:     number;
    schemaId:     number;
    classCode:    string | null;
  }[]>`
    SELECT
      a.attribute_id        AS "attributeId",
      a.physical_name_text  AS "physicalName",
      a.friendly_name_text  AS "friendlyName",
      a.data_type_text      AS "dataType",
      e.entity_name_text    AS "entityName",
      e.entity_id           AS "entityId",
      e.schema_id           AS "schemaId",
      a.classification_code AS "classCode"
    FROM bayanat.data_attributes a
    JOIN bayanat.data_entities e ON e.entity_id = a.entity_id
    WHERE a.glossary_term_text = ${term.termName}
    ORDER BY e.entity_name_text, a.physical_name_text
  `;

  return {
    ...term,
    aliases:          aliasRows.map((r): GlossaryAlias => ({ aliasId: r.aliasId, name: r.alias })),
    linkedAttributes: attrRows,
  };
}

export async function setTermRetentionCategory(
  glossaryId: number,
  userId: string,
  retentionCategoryId: number | null,
): Promise<void> {
  const [old] = await sql<{ retention_category_id: number | null }[]>`
    SELECT retention_category_id FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  await sql`
    UPDATE bayanat.business_glossaries
    SET retention_category_id = ${retentionCategoryId}
    WHERE glossary_id = ${glossaryId}
  `;
  if (old) {
    await logUpdate("BUSINESS_GLOSSARIES", glossaryId, userId, [
      { field: "retention_category_id", oldVal: String(old.retention_category_id ?? ""), newVal: String(retentionCategoryId ?? "") },
    ]);
  }
}

// ----- Glossary mutations -----

export async function updateGlossaryTerm(
  glossaryId: number,
  userId: string,
  patch: {
    definition:    string;
    format:        string;
    businessRules: string;
    classCode:     string | null;
    isPii:         boolean;
    piCategory:    string | null;
    example:       string;
    termType:      string;
  },
): Promise<void> {
  const [old] = await sql<{
    definition_text:     string | null;
    format_text:         string | null;
    business_rules_text: string | null;
    classification_code: string | null;
    is_pii_indicator:    boolean;
    pi_category_code:    string | null;
    example_text:        string | null;
    term_type:           string | null;
  }[]>`
    SELECT definition_text, format_text, business_rules_text, classification_code,
           is_pii_indicator, pi_category_code, example_text, term_type
    FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  await sql`
    UPDATE bayanat.business_glossaries
    SET
      definition_text     = ${patch.definition},
      format_text         = ${patch.format        || null},
      business_rules_text = ${patch.businessRules || null},
      classification_code = ${patch.classCode},
      is_pii_indicator    = ${patch.isPii},
      pi_category_code    = ${patch.piCategory},
      example_text        = ${patch.example       || null},
      term_type           = ${patch.termType}
    WHERE glossary_id = ${glossaryId}
  `;
  if (old) {
    await logUpdate("BUSINESS_GLOSSARIES", glossaryId, userId, [
      { field: "definition_text",     oldVal: old.definition_text,          newVal: patch.definition    || null },
      { field: "format_text",         oldVal: old.format_text,              newVal: patch.format        || null },
      { field: "business_rules_text", oldVal: old.business_rules_text,      newVal: patch.businessRules || null },
      { field: "classification_code", oldVal: old.classification_code,      newVal: patch.classCode },
      { field: "is_pii_indicator",    oldVal: String(old.is_pii_indicator), newVal: String(patch.isPii) },
      { field: "pi_category_code",    oldVal: old.pi_category_code,         newVal: patch.piCategory },
      { field: "example_text",        oldVal: old.example_text,             newVal: patch.example       || null },
      { field: "term_type",           oldVal: old.term_type,                newVal: patch.termType },
    ]);
  }
}

export async function addAlias(glossaryId: number, name: string): Promise<number> {
  const rows = await sql<{ aliasId: number }[]>`
    INSERT INTO bayanat.glossary_aliases (glossary_id, alias_name_text)
    VALUES (${glossaryId}, ${name})
    RETURNING alias_id AS "aliasId"
  `;
  return rows[0].aliasId;
}

export async function deleteAlias(aliasId: number): Promise<void> {
  await sql`DELETE FROM bayanat.glossary_aliases WHERE alias_id = ${aliasId}`;
}
