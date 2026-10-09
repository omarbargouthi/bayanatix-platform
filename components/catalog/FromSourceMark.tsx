// Marks a field whose current value was filled from the source system during a crawl
// (db/166: data_entities / data_attributes .source_synced_json).
export type SourceSynced = Record<string, { value?: unknown; sourceKey?: string; method?: string; crawledAt?: string } | undefined>;

export function FromSourceMark({ synced, field, current }: {
  synced: SourceSynced | null | undefined;
  field: "TABLE_TYPE" | "COLUMN_TYPE" | "FRIENDLY_NAME" | "ENCRYPTED" | "DESCRIPTION";
  /** The value on screen. When given, the mark shows only while it is still what the crawl wrote. */
  current?: string | null;
}) {
  const s = synced?.[field];
  if (!s) return null;
  if (current !== undefined && s.value !== current) return null;
  // A description is the comment's own text, not a named property or key.
  const where = field === "DESCRIPTION" ? "the comment" : s.method === "EXTENDED_PROPERTY" ? `extended property "${s.sourceKey}"` : `"${s.sourceKey}" in the comment`;
  const when = s.crawledAt ? ` · last read ${s.crawledAt.slice(0, 10)}` : "";
  return (
    <span title={`Filled from the source system during the crawl (${where})${when}`}
      className="inline-block align-middle text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-200 whitespace-nowrap ms-1.5">
      from source
    </span>
  );
}
