// Catalog object types (data_entities.object_type_code, db/146) — what the object
// actually is in its source system, as reported by that system's own catalog
// (information_schema.table_type, pg_class.relkind, sys.tables/sys.views,
// all_tables/all_views/all_mviews, Power BI/Fabric item kinds), never guessed
// from the object's name. Client- and server-safe.

export const OBJECT_TYPES = [
  "TABLE", "VIEW", "MATERIALIZED_VIEW", "FOREIGN_TABLE", "LAKEHOUSE_TABLE",
  "FILE", "API_RESOURCE", "SEMANTIC_MODEL", "REPORT", "REPORT_PAGE", "REPORT_VISUAL", "UNKNOWN",
] as const;
export type ObjectTypeCode = (typeof OBJECT_TYPES)[number];

export const isViewType = (t: string | null | undefined) => t === "VIEW" || t === "MATERIALIZED_VIEW";

/** information_schema.table_type (Postgres / MySQL / SQL Server) and the Oracle / SQL Server crawl labels. */
export function objectTypeFromSourceTableType(raw: string | null | undefined): ObjectTypeCode {
  switch ((raw ?? "").toUpperCase()) {
    case "BASE TABLE": case "TABLE": case "LOCAL TEMPORARY": case "SYSTEM VERSIONED": return "TABLE";
    case "VIEW": case "SYSTEM VIEW": return "VIEW";
    case "MATERIALIZED VIEW": return "MATERIALIZED_VIEW";
    case "FOREIGN": case "FOREIGN TABLE": return "FOREIGN_TABLE";
    default: return "UNKNOWN";
  }
}

/** Postgres pg_class.relkind. */
export function objectTypeFromRelkind(relkind: string | null | undefined): ObjectTypeCode {
  switch (relkind) {
    case "r": case "p": return "TABLE";
    case "v": return "VIEW";
    case "m": return "MATERIALIZED_VIEW";
    case "f": return "FOREIGN_TABLE";
    default: return "UNKNOWN";
  }
}

/** Types a steward can pick for an external endpoint in manual lineage. */
export const MANUAL_OBJECT_TYPES: ObjectTypeCode[] = ["TABLE", "VIEW", "FILE", "API_RESOURCE", "SEMANTIC_MODEL", "REPORT", "UNKNOWN"];
