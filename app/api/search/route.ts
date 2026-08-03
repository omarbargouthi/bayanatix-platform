import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { runSearch } from "@/lib/search/search-service";
import type { CommonFacets, SearchHitType, SearchResponse } from "@/lib/search-types";
import { ALL_TYPES } from "@/lib/search-types";

// Unified Search query API (spec §4/§5). One endpoint serves both the header
// type-ahead (mode=typeahead) and the full results page — spec's "one query API".
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const mode = searchParams.get("mode");
  const isTypeahead = mode === "typeahead";

  if (q.length < 2) {
    return NextResponse.json({ counts: {}, total: 0, page: 1, limit: 0, results: [] } satisfies SearchResponse);
  }

  const typesRaw = searchParams.get("types");
  const types: SearchHitType[] = typesRaw
    ? (typesRaw.split(",").filter((t) => (ALL_TYPES as string[]).includes(t)) as SearchHitType[])
    : [];

  const page = isTypeahead ? 1 : Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = isTypeahead ? 8 : Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "50")));

  const tagsRaw = searchParams.get("tags");
  const facets: CommonFacets = {
    dataSourceId: searchParams.get("dataSourceId") ? Number(searchParams.get("dataSourceId")) : undefined,
    ownerUserId: searchParams.get("owner") ?? undefined,
    classification: searchParams.get("classification")?.toUpperCase() ?? undefined,
    tagIds: tagsRaw ? tagsRaw.split(",").map(Number).filter((n) => !isNaN(n) && n > 0) : undefined,
    status: searchParams.get("status") ?? undefined,
    domainCode: searchParams.get("domain") ?? undefined,
    sinceDate: searchParams.get("since") ?? undefined,
    dqDimension: searchParams.get("dqDimension") ?? undefined,
    dsaScope: searchParams.get("dsaScope") ?? undefined,
  };

  const result = await runSearch({ q, types, page, limit, facets });

  // NFR: search analytics (query, filters, zero-result flag) — fire-and-forget, never blocks the response.
  sql`
    INSERT INTO bayanat.search_analytics (user_id, query_text, types_json, facets_json, result_count, zero_result_indicator)
    VALUES (${session.userId}, ${q}, ${JSON.stringify(types) as never}, ${JSON.stringify(facets) as never}, ${result.total}, ${result.total === 0})
  `.catch(() => { /* analytics is best-effort */ });

  return NextResponse.json(result satisfies SearchResponse);
}
