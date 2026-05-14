export type SearchHitType = "TABLE" | "VIEW" | "COLUMN" | "SCHEMA" | "SOURCE" | "TERM";

export const ALL_TYPES: SearchHitType[] = [
  "TABLE", "VIEW", "COLUMN", "SCHEMA", "SOURCE", "TERM",
];

export type FullSearchHit = {
  type: SearchHitType;
  id: number;
  name: string;
  description: string | null;
  href: string;
  path: string[];
  rowCount?: number | null;
  dataType?: string | null;
  tableName?: string;
  schemaName?: string;
  sourceName?: string;
  classification?: string;
  isView?: boolean;
  tags: { tagId: number; tagName: string; colorHex: string | null }[];
  stewards: { userId: string; fullName: string; roleCode: string }[];
};

export type SearchResponse = {
  counts: Partial<Record<SearchHitType, number>>;
  total: number;
  results: FullSearchHit[];
};
