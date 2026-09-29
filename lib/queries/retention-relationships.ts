import { sql } from "../db";

export type RelationshipCandidate = {
  parentEntityId: number; parentAttributeId: number; parentAttributeName: string;
  childEntityId: number; childEntityName: string; childSchemaName: string; childSourceName: string;
  childAttributeId: number; childAttributeName: string;
  sourceLinkId: number; discoveryMethod: "INTROSPECTED" | "NAME_INFERRED" | "MANUAL";
};

// One hop outward from `entityId`: every FK link in the crawled/registered
// graph whose referenced column belongs to this entity — the link's own
// (fk_attribute_id-owning) entity is the candidate child. REFERENCE-classified
// tables (lookups/enums — see lib/crawler.ts's classifyTableType) are
// excluded per the retention config's own scoping rule, and any entity
// already visited in this walk is excluded to keep multi-hop traversal
// cycle-safe. Real FK duplicates (INTROSPECTED + NAME_INFERRED landing on
// the exact same child column) are deduped, preferring INTROSPECTED.
export async function suggestRelationships(
  entityId: number, excludeEntityIds: number[] = [],
): Promise<RelationshipCandidate[]> {
  const rows = await sql<RelationshipCandidate[]>`
    SELECT
      refa.entity_id            AS "parentEntityId",
      refa.attribute_id         AS "parentAttributeId",
      refa.physical_name_text   AS "parentAttributeName",
      fke.entity_id             AS "childEntityId",
      fke.entity_name_text      AS "childEntityName",
      s.schema_name_text        AS "childSchemaName",
      ds.source_name_text       AS "childSourceName",
      fka.attribute_id          AS "childAttributeId",
      fka.physical_name_text    AS "childAttributeName",
      l.link_id                 AS "sourceLinkId",
      l.discovery_method_code   AS "discoveryMethod"
    FROM bayanat.attribute_reference_links l
    JOIN bayanat.data_attributes refa ON refa.attribute_id = l.referenced_attribute_id
    JOIN bayanat.data_attributes fka  ON fka.attribute_id  = l.fk_attribute_id
    JOIN bayanat.data_entities fke    ON fke.entity_id     = fka.entity_id
    JOIN bayanat.data_schemas s       ON s.schema_id       = fke.schema_id
    JOIN bayanat.data_sources ds      ON ds.data_source_id = s.data_source_id
    WHERE refa.entity_id = ${entityId}
      AND fke.entity_category_code IS DISTINCT FROM 'REFERENCE'
      AND fke.entity_id != ALL(${[entityId, ...excludeEntityIds]})
    ORDER BY fke.entity_name_text, fka.physical_name_text,
      CASE l.discovery_method_code WHEN 'INTROSPECTED' THEN 0 WHEN 'MANUAL' THEN 1 ELSE 2 END
  `;
  // Dedupe on (childEntityId, childAttributeId) — keep the first (best-ranked) row per pair.
  const seen = new Set<string>();
  const deduped: RelationshipCandidate[] = [];
  for (const r of rows) {
    const key = `${r.childEntityId}:${r.childAttributeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

export type RetentionRelationship = {
  relationshipId: number;
  categoryId: number;
  parentEntityId: number; parentEntityName: string; parentAttributeName: string;
  childEntityId: number; childEntityName: string; childAttributeName: string;
  joinConditionText: string | null;
  discoveryMethod: "SUGGESTED_FK" | "MANUAL";
  isActive: boolean;
  createdAt: string;
};

export async function getCategoryRelationships(categoryId: number): Promise<RetentionRelationship[]> {
  return sql<RetentionRelationship[]>`
    SELECT
      r.relationship_id AS "relationshipId", r.category_id AS "categoryId",
      r.parent_entity_id AS "parentEntityId", pe.entity_name_text AS "parentEntityName",
      pa.physical_name_text AS "parentAttributeName",
      r.child_entity_id AS "childEntityId", ce.entity_name_text AS "childEntityName",
      ca.physical_name_text AS "childAttributeName",
      r.join_condition_text AS "joinConditionText",
      r.discovery_method AS "discoveryMethod",
      r.is_active AS "isActive",
      r.created_at AS "createdAt"
    FROM bayanat.retention_relationships r
    JOIN bayanat.data_entities pe ON pe.entity_id = r.parent_entity_id
    JOIN bayanat.data_attributes pa ON pa.attribute_id = r.parent_attribute_id
    JOIN bayanat.data_entities ce ON ce.entity_id = r.child_entity_id
    JOIN bayanat.data_attributes ca ON ca.attribute_id = r.child_attribute_id
    WHERE r.category_id = ${categoryId}
    ORDER BY pe.entity_name_text, ce.entity_name_text
  `;
}

export async function addRelationship(params: {
  categoryId: number; parentEntityId: number; parentAttributeId: number;
  childEntityId: number; childAttributeId: number; joinConditionText: string | null;
  discoveryMethod: "SUGGESTED_FK" | "MANUAL"; sourceLinkId: number | null; userId: string;
}): Promise<number> {
  const [row] = await sql<{ relationshipId: number }[]>`
    INSERT INTO bayanat.retention_relationships
      (category_id, parent_entity_id, parent_attribute_id, child_entity_id, child_attribute_id,
       join_condition_text, discovery_method, source_link_id, created_by_user_id)
    VALUES (
      ${params.categoryId}, ${params.parentEntityId}, ${params.parentAttributeId},
      ${params.childEntityId}, ${params.childAttributeId},
      ${params.joinConditionText}, ${params.discoveryMethod}, ${params.sourceLinkId}, ${params.userId}
    )
    ON CONFLICT (category_id, parent_attribute_id, child_attribute_id) DO UPDATE SET
      join_condition_text = EXCLUDED.join_condition_text,
      is_active = TRUE,
      updated_at = NOW()
    RETURNING relationship_id AS "relationshipId"
  `;
  return row.relationshipId;
}

// joinConditionText and isActive are each applied only when explicitly
// passed (not `undefined`) — including setting joinConditionText to `null`
// to genuinely clear it, which a COALESCE-based single UPDATE can't express
// (COALESCE(NULL, existing) just keeps the old value, silently no-op'ing a
// clear). Two small conditional statements instead of one combined query.
export async function updateRelationship(
  relationshipId: number, joinConditionText: string | null | undefined, isActive: boolean | undefined,
): Promise<void> {
  if (joinConditionText !== undefined) {
    await sql`
      UPDATE bayanat.retention_relationships SET join_condition_text = ${joinConditionText}, updated_at = NOW()
      WHERE relationship_id = ${relationshipId}
    `;
  }
  if (isActive !== undefined) {
    await sql`
      UPDATE bayanat.retention_relationships SET is_active = ${isActive}, updated_at = NOW()
      WHERE relationship_id = ${relationshipId}
    `;
  }
}

export async function deleteRelationship(relationshipId: number): Promise<void> {
  await sql`DELETE FROM bayanat.retention_relationships WHERE relationship_id = ${relationshipId}`;
}
