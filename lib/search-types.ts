export type SearchHitType =
  | "TABLE" | "VIEW" | "COLUMN" | "SCHEMA" | "SOURCE" | "TERM"
  | "TAG" | "DQ_RULE" | "SHARING_AGREEMENT" | "OPEN_DATA" | "FOI_REQUEST" | "REGISTER_ENTRY" | "CUSTOM_ASSET";

export const ALL_TYPES: SearchHitType[] = [
  "TABLE", "VIEW", "COLUMN", "SCHEMA", "SOURCE", "TERM",
  "TAG", "DQ_RULE", "SHARING_AGREEMENT", "OPEN_DATA", "FOI_REQUEST", "REGISTER_ENTRY", "CUSTOM_ASSET",
];

// Types with a real query layer + detail page vs. legacy/unused tables
// (DQ_ISSUE via governance_tasks, APPLICATION via business_applications) that
// have zero UI anywhere in the app to deep-link to — deliberately out of scope.

export type FullSearchHit = {
  type: SearchHitType;
  id: number;
  name: string;
  description: string | null;
  href: string;
  path: string[];
  rankTier: number;           // 0=exact name, 1=name prefix, 2=alias/glossary, 3=description — for cross-type merge ordering
  updatedAt: string | null;   // ISO timestamp, for recency tie-break + "date modified" facet
  rowCount?: number | null;
  dataType?: string | null;
  tableName?: string;
  schemaName?: string;
  sourceName?: string;
  classification?: string;
  isView?: boolean;
  tags: { tagId: number; tagName: string; colorHex: string | null }[];
  stewards: { userId: string; fullName: string; roleCode: string }[];
  // Type-specific extras (populated only for the relevant type)
  meta?: {
    usageCount?: number;               // TAG
    dimension?: string | null;         // DQ_RULE
    severity?: string | null;          // DQ_RULE
    isActive?: boolean;                // DQ_RULE
    lastResultStatus?: string | null;  // DQ_RULE
    scope?: string | null;             // SHARING_AGREEMENT
    status?: string | null;            // SHARING_AGREEMENT | OPEN_DATA | FOI_REQUEST
    expiryDate?: string | null;        // SHARING_AGREEMENT
    dueDate?: string | null;           // FOI_REQUEST
    officerName?: string | null;       // FOI_REQUEST
    registerName?: string;             // REGISTER_ENTRY
    customTypeCode?: string;           // CUSTOM_ASSET
    customTypeName?: string;           // CUSTOM_ASSET
  };
};

export type CommonFacets = {
  dataSourceId?: number;
  ownerUserId?: string;
  classification?: string;
  tagIds?: number[];
  status?: string;
  domainCode?: string;
  sinceDate?: string;   // ISO date — "date modified" facet lower bound
  // Type-specific facets (only meaningful when a single type is selected)
  dqDimension?: string;
  dsaScope?: string;
  customTypeCode?: string;
};

export type SearchResponse = {
  counts: Partial<Record<SearchHitType, number>>;
  total: number;
  page: number;
  limit: number;
  results: FullSearchHit[];
  suggestions?: string[];   // empty-state: closest glossary terms via trigram similarity
};
