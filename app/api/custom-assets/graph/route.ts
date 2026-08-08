import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getLinksForAsset, getCustomAssetTypeByCode, resolveAssetNames, type ResolvedLink } from "@/lib/queries/custom-assets";

// Relationship graph (deferred spec FR-3.1/3.2). BFS from a center asset over
// bayanat.custom_asset_links, capped at 500 nodes (NFR §5), honoring valid_from/
// valid_to against an "as of" date, with an optional only-PII prune on
// DATA_ATTRIBUTES nodes. Returns a flat node/edge list (not MindMapTab's nested
// expandable-group shape) — a flat, dagre-laid-out graph is the natural fit for
// true multi-hop depth (1-3), whereas the radial group format was designed around
// a fixed single-hop neighborhood.

const MAX_NODES = 500;

const CORE_COLORS: Record<string, string> = {
  DATA_SOURCES: "#7c3aed", DATA_SCHEMAS: "#f59e0b", DATA_ENTITIES: "#10b981", DATA_ATTRIBUTES: "#3b82f6",
};

type GraphNode = {
  id: string; assetType: string; assetId: number; label: string; href: string | null;
  isCenter: boolean; color: string; classification: string | null; isPii: boolean;
};
type GraphEdge = { id: string; source: string; target: string; label: string; relCode: string };

function nodeKey(type: string, id: number) {
  return `${type}:${id}`;
}

async function colorForType(typeCode: string, colorCache: Map<string, string>): Promise<string> {
  if (CORE_COLORS[typeCode]) return CORE_COLORS[typeCode];
  if (colorCache.has(typeCode)) return colorCache.get(typeCode)!;
  if (typeCode.startsWith("CUSTOM:")) {
    const t = await getCustomAssetTypeByCode(typeCode.slice("CUSTOM:".length));
    const color = t?.colorHex ?? "#6058A0";
    colorCache.set(typeCode, color);
    return color;
  }
  return "#94a3b8";
}

function withinAsOf(link: ResolvedLink, asOf: string): boolean {
  if (link.validFromDate && link.validFromDate > asOf) return false;
  if (link.validToDate && link.validToDate < asOf) return false;
  return true;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const centerType = searchParams.get("assetType") ?? "";
  const centerId = Number(searchParams.get("assetId"));
  const depth = Math.min(3, Math.max(1, Number(searchParams.get("depth") ?? "1")));
  const onlyPii = searchParams.get("onlyPii") === "true";
  const asOf = searchParams.get("asOf") || new Date().toISOString().slice(0, 10);
  const relTypeFilter = searchParams.get("relTypes")?.split(",").filter(Boolean) ?? null;
  const assetTypeFilter = searchParams.get("assetTypes")?.split(",").filter(Boolean) ?? null;

  if (!centerType || !Number.isFinite(centerId)) {
    return NextResponse.json({ error: "assetType and assetId are required" }, { status: 400 });
  }

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const colorCache = new Map<string, string>();
  let truncated = false;

  const centerColor = await colorForType(centerType, colorCache);
  const centerNameMap = await resolveAssetNames([{ typeCode: centerType, id: centerId }]);
  const centerInfo = centerNameMap.get(`${centerType}:${centerId}`);
  nodes.set(nodeKey(centerType, centerId), {
    id: nodeKey(centerType, centerId), assetType: centerType, assetId: centerId,
    label: centerInfo?.name ?? `#${centerId}`, href: centerInfo?.href ?? null,
    isCenter: true, color: centerColor, classification: null, isPii: false,
  });

  let frontier: { type: string; id: number }[] = [{ type: centerType, id: centerId }];
  const visited = new Set<string>([nodeKey(centerType, centerId)]);

  for (let hop = 0; hop < depth && nodes.size < MAX_NODES; hop++) {
    const nextFrontier: { type: string; id: number }[] = [];
    for (const f of frontier) {
      if (nodes.size >= MAX_NODES) { truncated = true; break; }
      const links = await getLinksForAsset(f.type, f.id);
      for (const link of links) {
        if (!withinAsOf(link, asOf)) continue;
        if (relTypeFilter && !relTypeFilter.includes(link.relCode)) continue;
        if (assetTypeFilter && !assetTypeFilter.includes(link.otherAssetTypeCode)) continue;

        const otherKey = nodeKey(link.otherAssetTypeCode, link.otherAssetId);
        if (!nodes.has(otherKey)) {
          if (nodes.size >= MAX_NODES) { truncated = true; continue; }
          const color = await colorForType(link.otherAssetTypeCode, colorCache);
          nodes.set(otherKey, {
            id: otherKey, assetType: link.otherAssetTypeCode, assetId: link.otherAssetId,
            label: link.otherAssetName, href: link.otherAssetHref, isCenter: false, color,
            classification: null, isPii: false,
          });
        }
        const fromKey = nodeKey(f.type, f.id);
        const edgeId = link.direction === "OUT" ? `${fromKey}->${otherKey}:${link.relCode}` : `${otherKey}->${fromKey}:${link.relCode}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, {
            id: edgeId,
            source: link.direction === "OUT" ? fromKey : otherKey,
            target: link.direction === "OUT" ? otherKey : fromKey,
            label: link.label, // already the correctly-directed label relative to the traversal origin (f)
            relCode: link.relCode,
          });
        }
        if (!visited.has(otherKey)) {
          visited.add(otherKey);
          nextFrontier.push({ type: link.otherAssetTypeCode, id: link.otherAssetId });
        }
      }
    }
    frontier = nextFrontier;
  }

  // Enrich DATA_ATTRIBUTES nodes with classification/PII for badges + only-PII pruning.
  const attrIds = [...nodes.values()].filter((n) => n.assetType === "DATA_ATTRIBUTES").map((n) => n.assetId);
  if (attrIds.length > 0) {
    const rows = await sql<{ attributeId: number; classification: string | null; isPii: boolean }[]>`
      SELECT a.attribute_id AS "attributeId", bg.classification_code AS classification,
             COALESCE(bg.is_pii_indicator, false) AS "isPii"
      FROM bayanat.data_attributes a
      LEFT JOIN bayanat.asset_business_terms abt ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = a.attribute_id AND abt.term_role = 'CLASSIFICATION'
      LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
      WHERE a.attribute_id = ANY(${attrIds})
    `;
    const byId = new Map(rows.map((r) => [r.attributeId, r]));
    for (const n of nodes.values()) {
      if (n.assetType !== "DATA_ATTRIBUTES") continue;
      const r = byId.get(n.assetId);
      n.classification = r?.classification ?? null;
      n.isPii = r?.isPii ?? false;
    }
  }

  let finalNodes = [...nodes.values()];
  let finalEdges = [...edges.values()];
  if (onlyPii) {
    const dropped = new Set(finalNodes.filter((n) => n.assetType === "DATA_ATTRIBUTES" && !n.isPii && !n.isCenter).map((n) => n.id));
    finalNodes = finalNodes.filter((n) => !dropped.has(n.id));
    finalEdges = finalEdges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target));
  }

  return NextResponse.json({ nodes: finalNodes, edges: finalEdges, truncated });
}
