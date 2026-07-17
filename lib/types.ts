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
  businessAppName: string | null;
  schemaCount?: number;
  tableCount?: number;
};

export type AuditEntry = {
  auditId:   number;
  action:    string;
  userId:    string;
  userName:  string | null;
  timestamp: string;
  changes: {
    field: string;
    from:  string | null;
    to:    string | null;
  }[];
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
  cdeCount?: number;
};

export type DataEntity = {
  entityId: number;
  schemaId: number;
  entityName: string;
  displayName: string | null;
  category: string | null;
  description: string | null;
  sourceDescription: string | null;
  isView: boolean;
  certCode?: string | null;
  dataCertCode?: string | null;
  trustScore?: number | null;
  rowCount?: number | null;
  columnCount?: number;
  stewards?: Steward[];
  // Incidents (legacy DQ tracking)
  openIncidentCount?: number;
  topSeverity?: "HIGH" | "MEDIUM" | "LOW" | null;
  highIncidents?: number;
  mediumIncidents?: number;
  lowIncidents?: number;
  // Requests (unified issue/request system)
  openRequestCount?: number;
  topRequestPriority?: "HIGH" | "MEDIUM" | "LOW" | null;
  // Open request count shown in warning triangle (requests only, incidents in DQ panel)
  totalWarnings?: number;
  // Rating summary (denormalised from asset_ratings for list view)
  avgRating?: number | null;
  ratingCount?: number;
  // Usage
  queries30d?: number | null;
  queryPrev30d?: number | null;
  uniqueUsers?: number | null;
  uniqueUsersPrev?: number | null;
  avgQueryMs?: number | null;
  avgQueryMsPrev?: number | null;
  lastAccessedAt?: string | null;
};

export type TagRecord = {
  tagId:       number;
  tagName:     string;
  parentTagId: number | null;
  colorHex:    string;
  description: string | null;
  createdAt:   string;
  childCount?: number;
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
  sourceDescription: string | null;
  classificationCode?: string | null;
  glossaryTerm?: string | null;
  qualityScore?: number | null;
  nullPercentage?: number | null;
  isEncrypted: boolean;
  columnType: string | null;
  retentionCategoryId?:    number | null;
  retentionCategoryName?:  string | null;
  // From the linked CLASSIFICATION business term
  classTermName?:           string | null;
  classTermClassCode?:      string | null;
  classTermClassName?:      string | null;
  classTermIsPii?:          boolean | null;
  classTermPiCategoryCode?: string | null;
  classTermPiCategoryName?: string | null;
};

export type Steward = {
  userId: string;
  fullName: string;
  initials: string;
  role: string | null;
};

export type GovernanceDomain = {
  domainCode:    string;
  name:          string;
  nameAr?:       string | null;
  description:   string;
  descriptionAr?: string | null;
  compliancePct: number;
  maturityLevel: number;
  level:         string;
  alertCount:    number;
  sortOrder:     number;
  weight?:       number;
  openRequestCount?: number;
};

export type ComplianceSummary = {
  overallPct: number;
  overallMaturityPct: number;
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
  assetType: "TABLE" | "COLUMN" | "GLOSSARY" | "SCHEMA" | "TERM" | "SOURCE";
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

export type GlossarySteward = {
  stewardId:  number;
  glossaryId: number;
  userId:     string;
  fullName:   string | null;
  email:      string | null;
  assignedAt: string;
};

export type GlossaryDomain = {
  glossaryId:    number;
  termName:      string;
  description:   string;
  classCode:     string | null;
  termCount:     number;
  ownerUserId?:  string | null;
  ownerName?:    string | null;
  stewards?:     GlossarySteward[];
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

export type GlossaryAlias = {
  aliasId: number;
  name:    string;
};

export type GlossaryTermDetail = {
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
  ownerUserId:           string | null;
  ownerName:             string | null;
  stewards:              GlossarySteward[];
  aliases:               GlossaryAlias[];
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

// ── Collaboration ─────────────────────────────────────────────────────────────

export type CollabAssetRef = {
  assetType: string;
  assetId:   string;
  assetPath: string;
};

export type CollabThread = {
  threadId:     number;
  title:        string;
  createdBy:    string;
  authorName:   string;
  createdAt:    string;
  updatedAt:    string;
  messageCount: number;
  assetRefs:    CollabAssetRef[];
  threadType:   "DISCUSSION" | "QUESTION";
  statusCode:   "OPEN" | "CLOSED";
  closedAt:     string | null;
};

// ── Asset tags / terms / ratings ──────────────────────────────────────────────

export type AssetTag = {
  tagId:       number;
  tagName:     string;
  colorHex:    string;
  parentTagId: number | null;
};

export type LinkedTerm = {
  glossaryId:  number;
  termName:    string;
  domainName:  string | null;
  isPii:       boolean;
  termRole:    "CLASSIFICATION" | "ENRICHMENT";
};

export type AssetRating = {
  average:  number | null;
  count:    number;
  myRating: { stars: number; comment: string | null } | null;
};

export type CollabMessage = {
  messageId:  number;
  threadId:   number;
  authorId:   string;
  authorName: string;
  body:       string;
  createdAt:  string;
};

// Item returned by the /api/collab/assets picker endpoint
export type AssetPickerItem = {
  id:        string;
  label:     string;
  assetType: "DATA_SOURCE" | "SCHEMA" | "TABLE" | "COLUMN" | "GLOSSARY_DOMAIN" | "GLOSSARY_TERM";
  hasChildren: boolean;
};

// ── Asset Requests ─────────────────────────────────────────────────────────────

export type RequestTypeCode =
  | "FIX_DATA_ISSUE"
  | "UPDATE_DEFINITION"
  | "CERTIFY_ASSET"
  | "GRANT_ACCESS"
  | "REMOVE_ACCESS"
  | "OTHER"
  | "CLASSIFY_ASSET"
  | "PUBLISH_OPEN_DATA"
  | "PUBLISH_OPEN_DATA_PI";

// ── Open Data ─────────────────────────────────────────────────────────────────

export type OpenDataStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PUBLISHED"
  | "REJECTED"
  | "PENDING";

export type OpenDataFormat  = "xlsx" | "csv" | "json" | "xml" | "parquet";
export type OpenDataRefresh = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ON_DEMAND";

export type OpenDataset = {
  datasetId:            number;
  datasetName:          string;
  descriptionText:      string | null;
  departmentText:       string | null;
  categoryId:           number | null;
  categoryText:         string | null;   // English name from data_categories join (display only)
  categoryLabelAr:      string | null;   // Arabic name from data_categories join (display only)
  purposeText:          string | null;
  beneficiarySegments:  string[];
  publishDate:          string | null;
  coverageFromYear:     number | null;
  coverageToYear:       number | null;
  dataFormats:          OpenDataFormat[];
  dataSizeText:         string | null;
  refreshFrequency:     OpenDataRefresh | null;
  dqNotesText:          string | null;
  extractionLogic:      string | null;
  statusCode:           OpenDataStatus;
  raisedByUserId:       string;
  raisedByName:         string | null;
  columnCount:          number;
  hasPii:               boolean;
  createdAt:            string;
  updatedAt:            string;
};

export type OpenDataColumn = {
  odColumnId:                number;
  datasetId:                 number;
  attributeId:               number;
  physicalName:              string;
  friendlyName:              string | null;
  dataType:                  string;
  publishName:               string | null;
  publishDesc:               string | null;
  sortOrder:                 number;
  entityName:                string;
  entityId:                  number;
  schemaName:                string;
  schemaId:                  number;
  sourceName:                string;
  classTermName:             string | null;
  classTermCode:             string | null;
  classTermIsPii:            boolean;
  classTermPiCategory:       string | null;
  dqScore:                   number | null;
  dqRuleCount:               number;
  reclassificationReason:    string | null;
  reclassificationRequestId: number | null;
  deidentificationMethod:    string | null;
  deidentificationNotes:     string | null;
};

export type OpenDataDqIssue = {
  issueId:       number;
  datasetId:     number;
  attributeId:   number | null;
  columnName:    string | null;
  dimensionCode: string | null;
  dimensionName: string | null;
  issueText:     string;
  severityCode:  "BLOCKER" | "WARNING" | "INFO";
  createdAt:     string;
};

export type RequestPriority = "HIGH" | "MEDIUM" | "LOW";
export type RequestStatus   = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type AssetRequestTarget = {
  targetId:      number;
  requestId:     number;
  assetTypeCode: string;
  assetId:       number | null;
  assetIdText:   string | null;
  assetName:     string | null;
};

export type AssetRequest = {
  requestId:          number;
  requestTypeCode:    RequestTypeCode;
  title:              string;
  descriptionText:    string | null;
  priorityCode:       RequestPriority;
  statusCode:         RequestStatus;
  raisedByUserId:     string;
  raisedByName:       string | null;
  assignedToUserId:   string | null;
  assignedToName:     string | null;
  resolutionNotes:    string | null;
  createdAt:          string;
  updatedAt:          string;
  targets:            AssetRequestTarget[];
};

// ── Data Retention ────────────────────────────────────────────────────────────

export type DataCategory = {
  categoryId:     number;
  name:           string;
  nameAr:         string | null;
  parentId:       number | null;
  sensitivity:    "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  description:    string | null;
  descriptionAr:  string | null;
  examples:       string | null;
  sortOrder:      number;
  isActive:       boolean;
  createdAt:      string;
  children?:      DataCategory[];
  scheduleCount?: number;
  entityCount?:   number;
};

export type RetentionSchedule = {
  scheduleId:          number;
  categoryId:          number;
  jurisdiction:        string;
  triggerEvent:        string;
  triggerCustomExpr:   string | null;
  retentionPeriod:     number;
  retentionUnit:       "DAYS" | "MONTHS" | "YEARS";
  postRetentionAction: "DELETE" | "ANONYMIZE" | "ARCHIVE" | "REVIEW";
  archiveLocation:     string | null;
  regulatoryReference: string | null;
  notes:               string | null;
  isDefault:           boolean;
  createdAt:           string;
};

export type LegalHold = {
  holdId:             number;
  caseReference:      string;
  caseName:           string;
  holdScopeType:      "CATEGORY" | "ENTITY" | "GLOBAL";
  holdDate:           string;
  releaseDate:        string | null;
  holdStatus:         "ACTIVE" | "RELEASED" | "EXPIRED";
  placedBy:           string;
  placedByName:       string | null;
  releaseAuthority:   string | null;
  releaseJustification: string | null;
  notes:              string | null;
  createdAt:          string;
  categoryIds?:       number[];
  categoryNames?:     string[];
};

export type RetentionOverview = {
  totalCategories:    number;
  totalSchedules:     number;
  activeHolds:        number;
  entitiesClassified: number;
  entitiesTotal:      number;
  expiringSoon:       number;
  overdue:            number;
  byStatus: {
    status: string;
    count:  number;
  }[];
  bySensitivity: {
    sensitivity: string;
    count:       number;
  }[];
};
