import { sql } from "../db";

export type LegalHoldCondition = {
  conditionId: number;
  attributeId: number;
  attributeName: string;
  valueText: string;
};

export type LegalHoldEntity = {
  entityId: number;
  entityName: string;
  schemaName: string;
  sourceName: string;
  keyAttributeId: number | null;
  keyAttributeName: string | null;
  conditions: LegalHoldCondition[];
};

export async function getHoldEntities(holdId: number): Promise<LegalHoldEntity[]> {
  const entities = await sql<{
    entityId: number; entityName: string; schemaName: string; sourceName: string;
    keyAttributeId: number | null; keyAttributeName: string | null;
  }[]>`
    SELECT
      e.entity_id AS "entityId", e.entity_name_text AS "entityName",
      s.schema_name_text AS "schemaName", ds.source_name_text AS "sourceName",
      lhe.key_attribute_id AS "keyAttributeId", ka.physical_name_text AS "keyAttributeName"
    FROM bayanat.legal_hold_entities lhe
    JOIN bayanat.data_entities e ON e.entity_id = lhe.entity_id
    JOIN bayanat.data_schemas s ON s.schema_id = e.schema_id
    JOIN bayanat.data_sources ds ON ds.data_source_id = s.data_source_id
    LEFT JOIN bayanat.data_attributes ka ON ka.attribute_id = lhe.key_attribute_id
    WHERE lhe.hold_id = ${holdId}
    ORDER BY e.entity_name_text
  `;
  if (entities.length === 0) return [];

  const conditions = await sql<{
    entityId: number; conditionId: number; attributeId: number; attributeName: string; valueText: string;
  }[]>`
    SELECT lhc.entity_id AS "entityId", lhc.condition_id AS "conditionId",
           lhc.attribute_id AS "attributeId", a.physical_name_text AS "attributeName",
           lhc.value_text AS "valueText"
    FROM bayanat.legal_hold_conditions lhc
    JOIN bayanat.data_attributes a ON a.attribute_id = lhc.attribute_id
    WHERE lhc.hold_id = ${holdId}
    ORDER BY lhc.created_at
  `;
  const byEntity = new Map<number, LegalHoldCondition[]>();
  for (const c of conditions) {
    const list = byEntity.get(c.entityId) ?? [];
    list.push({ conditionId: c.conditionId, attributeId: c.attributeId, attributeName: c.attributeName, valueText: c.valueText });
    byEntity.set(c.entityId, list);
  }

  return entities.map((e) => ({ ...e, conditions: byEntity.get(e.entityId) ?? [] }));
}

export async function addHoldEntity(holdId: number, entityId: number, keyAttributeId: number | null): Promise<void> {
  await sql`
    INSERT INTO bayanat.legal_hold_entities (hold_id, entity_id, key_attribute_id)
    VALUES (${holdId}, ${entityId}, ${keyAttributeId})
    ON CONFLICT (hold_id, entity_id) DO UPDATE SET key_attribute_id = ${keyAttributeId}
  `;
}

export async function removeHoldEntity(holdId: number, entityId: number): Promise<void> {
  await sql`DELETE FROM bayanat.legal_hold_entities WHERE hold_id = ${holdId} AND entity_id = ${entityId}`;
}

export async function addHoldCondition(
  holdId: number, entityId: number, attributeId: number, valueText: string,
): Promise<number> {
  const [row] = await sql<{ conditionId: number }[]>`
    INSERT INTO bayanat.legal_hold_conditions (hold_id, entity_id, attribute_id, value_text)
    VALUES (${holdId}, ${entityId}, ${attributeId}, ${valueText})
    RETURNING condition_id AS "conditionId"
  `;
  return row.conditionId;
}

export async function removeHoldCondition(holdId: number, conditionId: number): Promise<void> {
  await sql`DELETE FROM bayanat.legal_hold_conditions WHERE hold_id = ${holdId} AND condition_id = ${conditionId}`;
}
