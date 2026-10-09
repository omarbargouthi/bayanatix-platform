// Marks a built-in field whose current value was filled from the source system during
// a crawl (db/166: data_entities / data_attributes .source_synced_json).
export type SourceSynced = Record<string, { sourceKey?: string; method?: string; crawledAt?: string } | undefined>;

export function FromSourceMark({ synced, field }: { synced: SourceSynced | null | undefined; field: "TABLE_TYPE" | "COLUMN_TYPE" | "FRIENDLY_NAME" | "ENCRYPTED" }) {
  const s = synced?.[field];
  if (!s) return null;
  const where = s.method === "EXTENDED_PROPERTY" ? `extended property "${s.sourceKey}"` : `"${s.sourceKey}" in the comment`;
  const when = s.crawledAt ? ` · last read ${s.crawledAt.slice(0, 10)}` : "";
  return (
    <span title={`Filled from the source system during the crawl (${where})${when}`}
      className="inline-block align-middle text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200 whitespace-nowrap ms-1.5">
      from source
    </span>
  );
}
