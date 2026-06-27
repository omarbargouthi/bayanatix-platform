import { sql } from "../db";
import { logUpdate } from "../audit";
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
      data_source_id     as "dataSourceId",
      source_name_text   as "sourceName",
      source_type_code   as "sourceType",
      database_name_text as "databaseName",
      description_text   as "description",
      business_app_name  as "businessAppName"
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
      s.schema_id        as "schemaId",
      s.data_source_id   as "dataSourceId",
      s.schema_name_text as "schemaName",
      s.description_text as "description",
      s.owner_user_id    as "ownerUserId",
      ds.source_name_text as "sourceName",
      (select count(*)::int
         from bayanat.data_attributes a
         join bayanat.data_entities e2 on e2.entity_id = a.entity_id
        where e2.schema_id = s.schema_id
          and a.glossary_term_text is not null) as "cdeCount"
    from bayanat.data_schemas s
    left join bayanat.data_sources ds on ds.data_source_id = s.data_source_id
    where s.schema_id = ${schemaId}
    limit 1
  `;
  if (!rows[0]) return null;
  const schema = rows[0];

  const entities = await sql<DataEntity[]>`
    select
      e.entity_id             as "entityId",
      e.schema_id             as "schemaId",
      e.entity_name_text      as "entityName",
      e.display_name_text     as "displayName",
      e.entity_category_code  as "category",
      e.description_text      as "description",
      coalesce(e.is_view_indicator, false) as "isView",
      e.row_count_estimate    as "rowCount",
      (select count(*)::int from bayanat.data_attributes a where a.entity_id = e.entity_id) as "columnCount",
      (select cert_type_code from bayanat.asset_certifications c
        where c.asset_type_code = 'DATA_ENTITIES' and c.asset_id = e.entity_id
          and c.cert_dimension = 'METADATA'
        order by c.certification_date desc nulls last limit 1) as "certCode",
      (select cert_type_code from bayanat.asset_certifications c
        where c.asset_type_code = 'DATA_ENTITIES' and c.asset_id = e.entity_id
          and c.cert_dimension = 'DATA'
        order by c.certification_date desc nulls last limit 1) as "dataCertCode",
      e.trust_score           as "trustScore",
      -- Incidents (open only, for DQ panel)
      coalesce(inc.open_count,   0) as "openIncidentCount",
      coalesce(inc.high_count,   0) as "highIncidents",
      coalesce(inc.med_count,    0) as "mediumIncidents",
      coalesce(inc.low_count,    0) as "lowIncidents",
      inc.top_severity              as "topSeverity",
      -- Requests (unified issue tracker, for warning triangle)
      coalesce(req.open_count,   0) as "openRequestCount",
      req.top_priority              as "topRequestPriority",
      -- Warning total = open requests only (incidents tracked separately in DQ panel)
      coalesce(req.open_count, 0) as "totalWarnings",
      -- Rating summary (pre-aggregated for list view)
      rat.avg_stars                 as "avgRating",
      coalesce(rat.rating_count, 0) as "ratingCount",
      -- Usage
      deu.queries_30d       as "queries30d",
      deu.queries_prev_30d  as "queryPrev30d",
      deu.unique_users      as "uniqueUsers",
      deu.unique_users_prev as "uniqueUsersPrev",
      deu.avg_query_ms      as "avgQueryMs",
      deu.avg_query_ms_prev as "avgQueryMsPrev",
      deu.last_accessed_at  as "lastAccessedAt"
    from bayanat.data_entities e
    left join bayanat.data_entity_usage deu on deu.entity_id = e.entity_id
    left join lateral (
      select
        (count(*) filter (where status_code != 'RESOLVED'))::int as open_count,
        (count(*) filter (where status_code != 'RESOLVED' and severity_code = 'HIGH'))::int as high_count,
        (count(*) filter (where status_code != 'RESOLVED' and severity_code = 'MEDIUM'))::int as med_count,
        (count(*) filter (where status_code != 'RESOLVED' and severity_code = 'LOW'))::int as low_count,
        (array_agg(severity_code order by case severity_code when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end)
         filter (where status_code != 'RESOLVED'))[1] as top_severity
      from bayanat.data_incidents
      where asset_type_code = 'DATA_ENTITIES' and asset_id = e.entity_id
    ) inc on true
    left join lateral (
      select
        count(*)::int as open_count,
        (array_agg(ar.priority_code order by
          case ar.priority_code when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end)
        )[1] as top_priority
      from bayanat.asset_request_targets art
      join bayanat.asset_requests ar on ar.request_id = art.request_id
      where art.asset_type_code = 'DATA_ENTITIES' and art.asset_id = e.entity_id
        and ar.status_code in ('OPEN','IN_PROGRESS')
    ) req on true
    left join lateral (
      select
        round(avg(stars)::numeric, 1) as avg_stars,
        count(*)::int                 as rating_count
      from bayanat.asset_ratings
      where asset_type_code = 'DATA_ENTITIES' and asset_id = e.entity_id
    ) rat on true
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
      e.source_description_text as "sourceDescription",
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
      a.source_description_text as "sourceDescription",
      a.classification_code as "classificationCode",
      a.glossary_term_text as "glossaryTerm",
      a.quality_score as "qualityScore",
      a.null_percentage as "nullPercentage",
      coalesce(a.is_encrypted, false) as "isEncrypted",
      a.attribute_class_code as "columnType",
      bg.retention_category_id  as "retentionCategoryId",
      dc.name                   as "retentionCategoryName",
      bg_cls.term_name_text        as "classTermName",
      bg_cls.classification_code   as "classTermClassCode",
      ct_cls.class_name_text       as "classTermClassName",
      bg_cls.is_pii_indicator      as "classTermIsPii",
      bg_cls.pi_category_code      as "classTermPiCategoryCode",
      pct_cls.category_name_text   as "classTermPiCategoryName"
    from bayanat.data_attributes a
    left join bayanat.business_glossaries bg
      on bg.term_name_text = a.glossary_term_text
      and bg.parent_glossary_id is not null
    left join bayanat.data_categories dc
      on dc.category_id = bg.retention_category_id
    left join bayanat.asset_business_terms abt_cls
      on abt_cls.asset_type_code = 'DATA_ATTRIBUTES'
      and abt_cls.asset_id = a.attribute_id
      and abt_cls.term_role = 'CLASSIFICATION'
    left join bayanat.business_glossaries bg_cls
      on bg_cls.glossary_id = abt_cls.glossary_id
    left join bayanat.classification_types ct_cls
      on ct_cls.class_code = bg_cls.classification_code
    left join bayanat.pi_category_types pct_cls
      on pct_cls.category_code = bg_cls.pi_category_code
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

// ----- Profiling data for a table -----

export type AttributeProfile = {
  attributeId:   number;
  nullCount:     number;
  nullPct:       number;
  distinctCount: number;
  minValue:      string | null;
  maxValue:      string | null;
  topValues:     { value: string; count: number }[];
};

export type EntityProfileData = {
  profileId:      number;
  profiledAt:     string;
  rowCount:       number | null;
  prevRowCount:   number | null;
  sampleSize:     number | null;
  profilingMode:  string | null;
  profilingLimit: number | null;
  attributes:     AttributeProfile[];
};

export async function getEntityProfile(entityId: number): Promise<EntityProfileData | null> {
  const rows = await sql<{
    profileId: number; profiledAt: string;
    rowCount: number | null; prevRowCount: number | null;
    sampleSize: number | null;
    profilingMode: string | null; profilingLimit: number | null;
  }[]>`
    SELECT profile_id AS "profileId", profiled_at::text AS "profiledAt",
           row_count AS "rowCount", prev_row_count AS "prevRowCount",
           sample_size AS "sampleSize",
           profiling_mode AS "profilingMode", profiling_limit AS "profilingLimit"
    FROM bayanat.entity_profile
    WHERE entity_id = ${entityId}
    ORDER BY profiled_at DESC LIMIT 1
  `;
  if (!rows[0]) return null;
  const prof = rows[0];

  const attrRows = await sql<{
    attributeId: number; nullCount: number; nullPct: number; distinctCount: number;
    minValue: string | null; maxValue: string | null; topValues: { value: string; count: number }[] | null;
  }[]>`
    SELECT attribute_id AS "attributeId", null_count AS "nullCount",
           null_pct AS "nullPct", distinct_count AS "distinctCount",
           min_value AS "minValue", max_value AS "maxValue",
           top_values AS "topValues"
    FROM bayanat.attribute_profile
    WHERE profile_id = ${prof.profileId}
  `;

  return {
    profileId:      prof.profileId,
    profiledAt:     prof.profiledAt,
    rowCount:       prof.rowCount     != null ? Number(prof.rowCount)     : null,
    prevRowCount:   prof.prevRowCount != null ? Number(prof.prevRowCount) : null,
    sampleSize:     prof.sampleSize   != null ? Number(prof.sampleSize)   : null,
    profilingMode:  prof.profilingMode,
    profilingLimit: prof.profilingLimit != null ? Number(prof.profilingLimit) : null,
    attributes: attrRows.map(a => ({
      attributeId:   Number(a.attributeId),
      nullCount:     Number(a.nullCount),
      nullPct:       Number(a.nullPct),
      distinctCount: Number(a.distinctCount),
      minValue:      a.minValue,
      maxValue:      a.maxValue,
      topValues:     Array.isArray(a.topValues)
                       ? (a.topValues as { value: string; count: number }[]).map(v => ({ value: v.value, count: Number(v.count) }))
                       : [],
    })),
  };
}

// ----- Metadata edits (with application-level audit logging) -----

export async function updateDataSource(
  sourceId: number,
  userId: string,
  patch: { description: string; businessAppName: string },
): Promise<void> {
  const [old] = await sql<{ description_text: string | null; business_app_name: string | null }[]>`
    SELECT description_text, business_app_name FROM bayanat.data_sources WHERE data_source_id = ${sourceId}
  `;
  await sql`
    UPDATE bayanat.data_sources
    SET description_text = ${patch.description || null}, business_app_name = ${patch.businessAppName || null}
    WHERE data_source_id = ${sourceId}
  `;
  if (old) {
    await logUpdate("DATA_SOURCES", sourceId, userId, [
      { field: "description_text",  oldVal: old.description_text,  newVal: patch.description    || null },
      { field: "business_app_name", oldVal: old.business_app_name, newVal: patch.businessAppName || null },
    ]);
  }
}

export async function updateSchema(
  schemaId: number,
  userId: string,
  description: string,
): Promise<void> {
  const [old] = await sql<{ description_text: string | null }[]>`
    SELECT description_text FROM bayanat.data_schemas WHERE schema_id = ${schemaId}
  `;
  await sql`
    UPDATE bayanat.data_schemas SET description_text = ${description || null} WHERE schema_id = ${schemaId}
  `;
  if (old) {
    await logUpdate("DATA_SCHEMAS", schemaId, userId, [
      { field: "description_text", oldVal: old.description_text, newVal: description || null },
    ]);
  }
}

export async function updateEntity(
  entityId: number,
  userId: string,
  patch: { description: string; displayName: string; category: string | null },
): Promise<void> {
  const [old] = await sql<{
    description_text:    string | null;
    display_name_text:   string | null;
    entity_category_code: string | null;
  }[]>`
    SELECT description_text, display_name_text, entity_category_code
    FROM bayanat.data_entities WHERE entity_id = ${entityId}
  `;
  await sql`
    UPDATE bayanat.data_entities
    SET
      description_text     = ${patch.description  || null},
      display_name_text    = ${patch.displayName   || null},
      entity_category_code = ${patch.category}
    WHERE entity_id = ${entityId}
  `;
  if (old) {
    await logUpdate("DATA_ENTITIES", entityId, userId, [
      { field: "description_text",     oldVal: old.description_text,     newVal: patch.description  || null },
      { field: "display_name_text",    oldVal: old.display_name_text,    newVal: patch.displayName  || null },
      { field: "entity_category_code", oldVal: old.entity_category_code, newVal: patch.category },
    ]);
  }
}

export async function updateAttribute(
  attributeId: number,
  userId: string,
  patch: {
    description:  string;
    friendlyName: string;
    isEncrypted:  boolean;
    columnType:   string | null;
    glossaryTerm: string;
  },
): Promise<void> {
  const [old] = await sql<{
    description_text:     string | null;
    friendly_name_text:   string | null;
    is_encrypted:         boolean;
    attribute_class_code: string | null;
    glossary_term_text:   string | null;
  }[]>`
    SELECT description_text, friendly_name_text, is_encrypted, attribute_class_code, glossary_term_text
    FROM bayanat.data_attributes WHERE attribute_id = ${attributeId}
  `;
  await sql`
    UPDATE bayanat.data_attributes
    SET
      description_text     = ${patch.description  || null},
      friendly_name_text   = ${patch.friendlyName || null},
      is_encrypted         = ${patch.isEncrypted},
      attribute_class_code = ${patch.columnType},
      glossary_term_text   = ${patch.glossaryTerm || null}
    WHERE attribute_id = ${attributeId}
  `;
  if (old) {
    await logUpdate("DATA_ATTRIBUTES", attributeId, userId, [
      { field: "description_text",     oldVal: old.description_text,     newVal: patch.description  || null },
      { field: "friendly_name_text",   oldVal: old.friendly_name_text,   newVal: patch.friendlyName || null },
      { field: "is_encrypted",         oldVal: String(old.is_encrypted), newVal: String(patch.isEncrypted) },
      { field: "attribute_class_code", oldVal: old.attribute_class_code, newVal: patch.columnType },
      { field: "glossary_term_text",   oldVal: old.glossary_term_text,   newVal: patch.glossaryTerm || null },
    ]);
  }
}

// ----- Asset creation -----

export async function createDataSource(patch: {
  sourceName: string; sourceType: string; databaseName: string;
  description: string; businessAppName: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_sources
      (source_name_text, source_type_code, database_name_text, description_text, business_app_name)
    VALUES (${patch.sourceName}, ${patch.sourceType}, ${patch.databaseName},
            ${patch.description || null}, ${patch.businessAppName || null})
    RETURNING data_source_id AS id
  `;
  return rows[0].id;
}

export async function createSchema(patch: {
  schemaName: string; dataSourceId: number; description: string; ownerUserId: string;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_schemas
      (schema_name_text, data_source_id, description_text, owner_user_id)
    VALUES (${patch.schemaName}, ${patch.dataSourceId},
            ${patch.description || null}, ${patch.ownerUserId || null})
    RETURNING schema_id AS id
  `;
  return rows[0].id;
}

export async function createEntity(patch: {
  entityName: string; schemaId: number; displayName: string;
  description: string; category: string | null; isView: boolean;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_entities
      (entity_name_text, schema_id, display_name_text, description_text,
       entity_category_code, is_view_indicator)
    VALUES (${patch.entityName}, ${patch.schemaId}, ${patch.displayName || null},
            ${patch.description || null}, ${patch.category}, ${patch.isView})
    RETURNING entity_id AS id
  `;
  return rows[0].id;
}

export async function createAttribute(patch: {
  physicalName: string; entityId: number; dataType: string;
  friendlyName: string; description: string; isPrimaryKey: boolean; isNullable: boolean;
}): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.data_attributes
      (physical_name_text, entity_id, data_type_text, friendly_name_text,
       description_text, is_primary_key_indicator, is_nullable_indicator)
    VALUES (${patch.physicalName}, ${patch.entityId}, ${patch.dataType},
            ${patch.friendlyName || null}, ${patch.description || null},
            ${patch.isPrimaryKey}, ${patch.isNullable})
    RETURNING attribute_id AS id
  `;
  return rows[0].id;
}

// ----- Tags -----
export async function listTags() {
  return sql<{ tagId: number; tagName: string; parentTagId: number | null; colorHex: string; description: string | null; createdAt: string; childCount: number }[]>`
    SELECT
      t.tag_id        AS "tagId",
      t.tag_name      AS "tagName",
      t.parent_tag_id AS "parentTagId",
      t.color_hex     AS "colorHex",
      t.description,
      t.created_at    AS "createdAt",
      (SELECT COUNT(*)::int FROM bayanat.tags c WHERE c.parent_tag_id = t.tag_id) AS "childCount"
    FROM bayanat.tags t
    ORDER BY t.parent_tag_id NULLS FIRST, t.tag_name
  `;
}

export async function createTag(patch: { tagName: string; parentTagId: number | null; colorHex: string; description: string }): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO bayanat.tags (tag_name, parent_tag_id, color_hex, description)
    VALUES (${patch.tagName}, ${patch.parentTagId}, ${patch.colorHex}, ${patch.description || null})
    RETURNING tag_id AS id
  `;
  return rows[0].id;
}

export async function updateTag(tagId: number, patch: { tagName: string; colorHex: string; description: string }): Promise<void> {
  await sql`
    UPDATE bayanat.tags SET tag_name=${patch.tagName}, color_hex=${patch.colorHex}, description=${patch.description || null}
    WHERE tag_id=${tagId}
  `;
}

export async function deleteTag(tagId: number): Promise<void> {
  await sql`DELETE FROM bayanat.tags WHERE tag_id=${tagId}`;
}

export async function getAssetTags(assetType: string, assetId: number) {
  return sql<{ tagId: number; tagName: string; colorHex: string; parentTagId: number | null }[]>`
    SELECT t.tag_id AS "tagId", t.tag_name AS "tagName", t.color_hex AS "colorHex", t.parent_tag_id AS "parentTagId"
    FROM bayanat.asset_tags at2
    JOIN bayanat.tags t ON t.tag_id = at2.tag_id
    WHERE at2.asset_type_code = ${assetType} AND at2.asset_id = ${assetId}
    ORDER BY t.tag_name
  `;
}

export async function setAssetTags(assetType: string, assetId: number, tagIds: number[], userId: string): Promise<void> {
  await sql`DELETE FROM bayanat.asset_tags WHERE asset_type_code=${assetType} AND asset_id=${assetId}`;
  if (tagIds.length === 0) return;
  for (const tagId of tagIds) {
    await sql`
      INSERT INTO bayanat.asset_tags (tag_id, asset_type_code, asset_id, assigned_by)
      VALUES (${tagId}, ${assetType}, ${assetId}, ${userId})
      ON CONFLICT DO NOTHING
    `;
  }
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
