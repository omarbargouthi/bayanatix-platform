import { sql } from "../db";
import type {
  DataSource,
  DataSchema,
  DataEntity,
  DataAttribute,
  CatalogStats,
  Steward,
} from "../types";

// ----- Top-level catalog stats -----
export async function getCatalogStats(): Promise<CatalogStats> {
  const rows = await sql<CatalogStats[]>`
    select
      (select count(*)::int from bayanat.data_sources)              as sources,
      coalesce((select sum(coalesce(row_count_estimate,0))::bigint
                from bayanat.data_entities), 0)::bigint              as records,
      (select count(*)::int from bayanat.data_entities)             as tables,
      (select count(*)::int from bayanat.data_schemas)              as schemas
  `;
  const r = rows[0];
  return {
    sources: Number(r.sources ?? 0),
    records: Number(r.records ?? 0),
    tables: Number(r.tables ?? 0),
    schemas: Number(r.schemas ?? 0),
  };
}

// ----- Sources tree (catalog page left/main) -----
export async function getSourcesWithSchemas(): Promise<
  (DataSource & { schemas: DataSchema[] })[]
> {
  const sources = await sql<DataSource[]>`
    select
      data_source_id   as "dataSourceId",
      source_name_text as "sourceName",
      source_type_code as "sourceType",
      database_name_text as "databaseName",
      description_text as "description"
    from bayanat.data_sources
    order by source_name_text
  `;
  if (sources.length === 0) return [];

  const schemas = await sql<DataSchema[]>`
    select
      s.schema_id      as "schemaId",
      s.data_source_id as "dataSourceId",
      s.schema_name_text as "schemaName",
      s.description_text as "description",
      s.owner_user_id  as "ownerUserId",
      (select count(*)::int from bayanat.data_entities e
        where e.schema_id = s.schema_id and coalesce(e.is_view_indicator,false) = false) as "tableCount",
      (select count(*)::int from bayanat.data_entities e
        where e.schema_id = s.schema_id and coalesce(e.is_view_indicator,false) = true)  as "viewCount"
    from bayanat.data_schemas s
    order by s.schema_name_text
  `;
  const grouped = new Map<number, DataSchema[]>();
  for (const sc of schemas) {
    const arr = grouped.get(sc.dataSourceId) ?? [];
    arr.push(sc);
    grouped.set(sc.dataSourceId, arr);
  }
  return sources.map((s) => ({ ...s, schemas: grouped.get(s.dataSourceId) ?? [] }));
}

// ----- Single schema with its entities -----
export async function getSchemaById(schemaId: number): Promise<
  (DataSchema & { source: DataSource | null; entities: DataEntity[] }) | null
> {
  const rows = await sql<(DataSchema & { sourceName: string | null })[]>`
    select
      s.schema_id      as "schemaId",
      s.data_source_id as "dataSourceId",
      s.schema_name_text as "schemaName",
      s.description_text as "description",
      s.owner_user_id  as "ownerUserId",
      ds.source_name_text as "sourceName"
    from bayanat.data_schemas s
    left join bayanat.data_sources ds on ds.data_source_id = s.data_source_id
    where s.schema_id = ${schemaId}
    limit 1
  `;
  if (!rows[0]) return null;
  const schema = rows[0];

  const entities = await sql<DataEntity[]>`
    select
      e.entity_id        as "entityId",
      e.schema_id        as "schemaId",
      e.entity_name_text as "entityName",
      e.display_name_text as "displayName",
      e.entity_category_code as "category",
      e.description_text as "description",
      coalesce(e.is_view_indicator, false) as "isView",
      e.row_count_estimate as "rowCount",
      (select count(*)::int from bayanat.data_attributes a where a.entity_id = e.entity_id) as "columnCount",
      (select cert_type_code from bayanat.asset_certifications c
        where c.asset_type_code = 'DATA_ENTITIES' and c.asset_id = e.entity_id
        order by c.certification_date desc nulls last limit 1) as "certCode",
      e.trust_score as "trustScore"
    from bayanat.data_entities e
    where e.schema_id = ${schemaId}
    order by e.entity_name_text
  `;

  // Stewards per entity (small fan-out, one query covers all)
  const stewards = await sql<(Steward & { entityId: number })[]>`
    select
      s.asset_id as "entityId",
      s.user_id  as "userId",
      u.full_name as "fullName",
      upper(left(coalesce(u.full_name, u.user_id), 1) || coalesce(split_part(u.full_name,' ',2),'')) as "initials",
      s.role_code as "role"
    from bayanat.asset_stakeholders s
    left join bayanat.users u on u.user_id = s.user_id
    where s.asset_type_code = 'DATA_ENTITIES'
      and s.asset_id in ${sql(entities.map((e) => e.entityId))}
  `;
  const stewardsByEntity = new Map<number, Steward[]>();
  for (const s of stewards) {
    const arr = stewardsByEntity.get(s.entityId) ?? [];
    arr.push({ userId: s.userId, fullName: s.fullName, initials: s.initials, role: s.role });
    stewardsByEntity.set(s.entityId, arr);
  }
  for (const e of entities) e.stewards = stewardsByEntity.get(e.entityId) ?? [];

  // Source for breadcrumb
  let source: DataSource | null = null;
  if (schema.dataSourceId) {
    const srcRows = await sql<DataSource[]>`
      select
        data_source_id as "dataSourceId",
        source_name_text as "sourceName",
        source_type_code as "sourceType",
        database_name_text as "databaseName",
        description_text as "description"
      from bayanat.data_sources where data_source_id = ${schema.dataSourceId}
    `;
    source = srcRows[0] ?? null;
  }

  return { ...schema, source, entities };
}

// ----- Single table with its attributes -----
export async function getEntityById(entityId: number): Promise<
  (DataEntity & {
    schema: DataSchema | null;
    source: DataSource | null;
    attributes: DataAttribute[];
  }) | null
> {
  const rows = await sql<DataEntity[]>`
    select
      e.entity_id        as "entityId",
      e.schema_id        as "schemaId",
      e.entity_name_text as "entityName",
      e.display_name_text as "displayName",
      e.entity_category_code as "category",
      e.description_text as "description",
      coalesce(e.is_view_indicator, false) as "isView",
      e.row_count_estimate as "rowCount",
      e.trust_score as "trustScore",
      (select cert_type_code from bayanat.asset_certifications c
        where c.asset_type_code = 'DATA_ENTITIES' and c.asset_id = e.entity_id
        order by c.certification_date desc nulls last limit 1) as "certCode"
    from bayanat.data_entities e
    where e.entity_id = ${entityId}
    limit 1
  `;
  if (!rows[0]) return null;
  const entity = rows[0];

  const attrs = await sql<DataAttribute[]>`
    select
      a.attribute_id    as "attributeId",
      a.entity_id       as "entityId",
      a.physical_name_text as "physicalName",
      a.friendly_name_text as "friendlyName",
      a.data_type_text  as "dataType",
      coalesce(a.is_primary_key_indicator, false) as "isPrimaryKey",
      coalesce(a.is_nullable_indicator, true)     as "isNullable",
      a.description_text as "description",
      a.classification_code as "classificationCode",
      a.glossary_term_text as "glossaryTerm",
      a.quality_score as "qualityScore",
      a.null_percentage as "nullPercentage"
    from bayanat.data_attributes a
    where a.entity_id = ${entityId}
    order by a.attribute_id
  `;

  let schema: DataSchema | null = null;
  let source: DataSource | null = null;
  if (entity.schemaId) {
    const sr = await sql<(DataSchema & { sourceName: string | null })[]>`
      select
        s.schema_id      as "schemaId",
        s.data_source_id as "dataSourceId",
        s.schema_name_text as "schemaName",
        s.description_text as "description",
        s.owner_user_id  as "ownerUserId",
        ds.source_name_text as "sourceName"
      from bayanat.data_schemas s
      left join bayanat.data_sources ds on ds.data_source_id = s.data_source_id
      where s.schema_id = ${entity.schemaId}
    `;
    schema = sr[0] ?? null;
    if (schema?.dataSourceId) {
      const srcRows = await sql<DataSource[]>`
        select
          data_source_id as "dataSourceId",
          source_name_text as "sourceName",
          source_type_code as "sourceType",
          database_name_text as "databaseName",
          description_text as "description"
        from bayanat.data_sources where data_source_id = ${schema.dataSourceId}
      `;
      source = srcRows[0] ?? null;
    }
  }

  return { ...entity, schema, source, attributes: attrs };
}

// ----- Glossaries (top-level domains) -----
export async function getGlossaryRoots() {
  return sql<{ glossaryId: number; termName: string; termCount: number }[]>`
    select
      g.glossary_id as "glossaryId",
      g.term_name_text as "termName",
      (select count(*)::int from bayanat.business_glossaries c where c.parent_glossary_id = g.glossary_id) as "termCount"
    from bayanat.business_glossaries g
    where g.parent_glossary_id is null
    order by g.term_name_text
  `;
}
