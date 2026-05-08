import { sql } from "../db";
import type { GlossaryDomain, GlossaryTerm, GlossaryTermDetail } from "../types";

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
    glossaryId:    number;
    termName:      string;
    definition:    string;
    businessRules: string | null;
    format:        string | null;
    example:       string | null;
    classCode:     string | null;
    isPii:         boolean;
    piCategory:    string | null;
    npiCategory:   string | null;
    domainName:    string | null;
    domainId:      number | null;
    createdAt:     string;
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
      p.term_name_text         AS "domainName",
      p.glossary_id            AS "domainId",
      g.created_at_timestamp   AS "createdAt"
    FROM bayanat.business_glossaries g
    LEFT JOIN bayanat.business_glossaries p ON p.glossary_id = g.parent_glossary_id
    WHERE g.glossary_id = ${id}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const term = rows[0];

  const aliasRows = await sql<{ alias: string }[]>`
    SELECT alias_name_text AS alias
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
    aliases:          aliasRows.map((r) => r.alias),
    linkedAttributes: attrRows,
  };
}
