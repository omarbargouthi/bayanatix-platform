// Domain types — mirror the Postgres schema in `bayanat.*`.
// Snake_case columns are mapped to camelCase via SQL aliases in the queries.

export type SessionUser = {
  userId: string;
  email: string;
  fullName: string;
  role: "ADMIN" | "STEWARD" | "OFFICER" | "VIEWER";
};

export type DataSource = {
  dataSourceId: number;
  sourceName: string;
  sourceType: string;
  databaseName: string;
  description: string | null;
  schemaCount?: number;
  tableCount?: number;
};

export type DataSchema = {
  schemaId: number;
  dataSourceId: number;
  schemaName: string;
  description: string | null;
  ownerUserId: string | null;
  tableCount?: number;
  viewCount?: number;
  columnCount?: number;
  sourceName?: string;
};

export type DataEntity = {
  entityId: number;
  schemaId: number;
  entityName: string;
  displayName: string | null;
  category: string | null;
  description: string | null;
  isView: boolean;
  certCode?: string | null;
  trustScore?: number | null;
  rowCount?: number | null;
  columnCount?: number;
  stewards?: Steward[];
};

export type DataAttribute = {
  attributeId: number;
  entityId: number;
  physicalName: string;
  friendlyName: string | null;
  dataType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  description: string | null;
  classificationCode?: string | null;
  glossaryTerm?: string | null;
  qualityScore?: number | null;
  nullPercentage?: number | null;
};

export type Steward = {
  userId: string;
  fullName: string;
  initials: string;
  role: string | null;
};

export type GovernanceDomain = {
  domainCode: string;
  name: string;
  description: string;
  compliancePct: number;
  maturityLevel: number;
  level: string;
  alertCount: number;
  sortOrder: number;
};

export type ComplianceSummary = {
  overallPct: number;
  specsTracked: number;
  domainsActive: number;
  controlsPassing: number;
  openFindings: number;
};

export type CatalogStats = {
  sources: number;
  records: number;
  tables: number;
  schemas: number;
};
