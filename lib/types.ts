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

export type ComplianceSnapshot = {
  current:     number;
  previous:    number;
  periodLabel: string;
  prevLabel:   string;
};

export type TrendPoint = {
  month:     number;
  ndiScore:  number;
  naiiScore: number;
};

export type RecentAsset = {
  assetType: "TABLE" | "COLUMN" | "GLOSSARY";
  assetId:   string;
  assetName: string;
  assetMeta: string | null;
  rowCount:  number | null;
  visitedAt: string;
  href:      string;
};

// ── Admin / RBAC ─────────────────────────────────────────────────────────────

export type AdminUser = {
  userId:      string;
  email:       string;
  fullName:    string;
  systemRole:  string;
  isActive:    boolean;
  createdAt:   string;
  teamCount:   number;
};

export type Role = {
  roleId:         number;
  roleName:       string;
  description:    string | null;
  metadataRead:   boolean;
  metadataWrite:  boolean;
  metadataDelete: boolean;
  dataRead:       boolean;
  isAdmin:        boolean;
  createdAt:      string;
  userCount:      number;
  teamCount:      number;
};

export type Team = {
  teamId:      number;
  teamName:    string;
  description: string | null;
  memberCount: number;
  roleCount:   number;
  createdAt:   string;
};

export type RoleAssignment = {
  assignmentId:  number;
  roleId:        number;
  roleName:      string;
  metadataRead:  boolean;
  metadataWrite: boolean;
  metadataDelete:boolean;
  dataRead:      boolean;
  isAdmin:       boolean;
  userId:        string | null;
  userFullName:  string | null;
  teamId:        number | null;
  teamName:      string | null;
  resourceType:  "GLOBAL" | "DATA_SOURCE" | "SCHEMA" | "TABLE";
  resourceId:    string | null;
  resourceName:  string | null;
  createdAt:     string;
};

export type TeamMember = {
  userId:    string;
  fullName:  string;
  email:     string;
  systemRole:string;
  joinedAt:  string;
};

// ── Glossary ──────────────────────────────────────────────────────────────────

export type GlossaryDomain = {
  glossaryId:  number;
  termName:    string;
  description: string;
  classCode:   string | null;
  termCount:   number;
};

export type GlossaryTerm = {
  glossaryId:         number;
  termName:           string;
  definition:         string;
  classCode:          string | null;
  isPii:              boolean;
  domainName:         string | null;
  domainId:           number | null;
  aliasCount:         number;
  linkedAttrCount:    number;
  createdAt:          string;
};

export type GlossaryTermDetail = {
  glossaryId:     number;
  termName:       string;
  definition:     string;
  businessRules:  string | null;
  format:         string | null;
  example:        string | null;
  classCode:      string | null;
  isPii:          boolean;
  piCategory:     string | null;
  npiCategory:    string | null;
  domainName:     string | null;
  domainId:       number | null;
  createdAt:      string;
  aliases:        string[];
  linkedAttributes: {
    attributeId:  number;
    physicalName: string;
    friendlyName: string | null;
    dataType:     string;
    entityName:   string;
    entityId:     number;
    schemaId:     number;
    classCode:    string | null;
  }[];
};

export type Notification = {
  notificationId: number;
  type:           string;
  title:          string;
  body:           string | null;
  isRead:         boolean;
  severity:       "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  domainCode:     string | null;
  actionLabel:    string | null;
  actionHref:     string | null;
  createdAt:      string;
};
