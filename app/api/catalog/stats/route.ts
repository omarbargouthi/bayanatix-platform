import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCatalogStats, getCdeCoverage, getBusinessClassificationBreakdown,
  getCdeMetadataQuality, getCdeDataQuality,
} from "@/lib/queries/catalog";

// Re-scopes every Data Catalog page analysis card (stat tiles, CDEs Coverage,
// Data Classification, Metadata Quality, Data Quality) to a set of data
// sources, so the source filter actually affects the whole page — not just
// the Data Assets tree. GET ?dataSourceIds=1,2,3 (omit/empty = all sources).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("dataSourceIds");
  const dataSourceIds = raw
    ? raw.split(",").map(Number).filter((n) => Number.isFinite(n))
    : undefined;

  const [stats, cdeCoverage, classification, cdeMetadataQuality, cdeDataQuality] = await Promise.all([
    getCatalogStats(dataSourceIds),
    getCdeCoverage(dataSourceIds),
    getBusinessClassificationBreakdown(dataSourceIds),
    getCdeMetadataQuality(dataSourceIds),
    getCdeDataQuality(dataSourceIds),
  ]);

  return NextResponse.json({ stats, cdeCoverage, classification, cdeMetadataQuality, cdeDataQuality });
}
