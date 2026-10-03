"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MarkerType,
  useNodesState, useEdgesState, type Node, type Edge, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { LineageNodeCard, layerLabels, LAYER_DOT, EngineGlyph, engineLabels, type LineageNodeData } from "./LineageNode";
import { ImpactReportPanel } from "./ImpactReportPanel";
import { AddLineageModal, type PickedTable } from "./AddLineageModal";
import { ChangeImpactPanel } from "./ChangeImpactPanel";
import { ReviewRequestModal } from "./ReviewRequestModal";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

type AssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";
type Scope = "ENTITY_LEVEL" | "ATTRIBUTE_LEVEL";

type GraphNode = {
  entityId: number; entityName: string; layerCode: string | null; schemaName: string | null;
  sourceName: string | null; sourceTypeCode: string | null; ownerName: string | null; qualityStatus: string; dqTagCount: number;
  columnCount: number; rowCountEstimate: number | null; isCurrent: boolean; hasUpstreamIssue: boolean;
  columns: { attributeId: number; name: string }[];
};

type GraphEdge = {
  lineageId: number; sourceEntityId: number; targetEntityId: number;
  sourceColumnName: string | null; targetColumnName: string | null;
  transformationTypeCode: string | null; transformationTypeName: string | null;
  transformationLogicText: string | null; processName: string | null;
  provenanceCode: string; isConfirmed: boolean; confidenceCode: string | null;
};

type Graph = {
  focus: { assetType: AssetType; assetId: number; entityId: number; name: string; columnName: string | null };
  nodes: GraphNode[]; edges: GraphEdge[];
  counts: { upstreamTotal: number; downstreamTotal: number };
};

type SearchResult = { assetType: AssetType; assetId: number; name: string; entityName: string | null; schemaName: string | null; attributeClassCode: string | null };

const NODE_W = 210, NODE_H = 106;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 } };
  });
}

// Swimlanes (FR-12.2): re-band the already-computed dagre Y positions by each
// node's source system, keeping dagre's X (topological rank) untouched — the
// left-to-right data-flow order is what dagre gets right; grouping by system is
// a pure Y-axis re-bucketing on top of it, not a different layout algorithm.
function applySwimlanes(laidOutNodes: Node[], systemOf: Map<string, string>): Node[] {
  const order: string[] = [];
  for (const n of laidOutNodes) {
    const sys = systemOf.get(n.id) ?? "—";
    if (!order.includes(sys)) order.push(sys);
  }
  const byBand = new Map<string, Node[]>(order.map((sys) => [sys, []]));
  for (const n of laidOutNodes) byBand.get(systemOf.get(n.id) ?? order[0])!.push(n);

  // Re-space each band's own nodes evenly by their original dagre Y order (which
  // is itself already collision-free) rather than reusing the raw Y value —
  // modulo-ing the original Y independently per node loses that relative
  // ordering and can stack multiple same-rank nodes from one system on top of
  // each other. Band height is sized to whatever that system actually needs.
  const spacing = NODE_H + 24;
  const bandGap = 40;
  let yOffset = 0;
  const positioned: Node[] = [];
  for (const sys of order) {
    const bandNodes = [...byBand.get(sys)!].sort((a, b) => a.position.y - b.position.y);
    bandNodes.forEach((n, i) => positioned.push({ ...n, position: { x: n.position.x, y: yOffset + i * spacing } }));
    yOffset += bandNodes.length * spacing + bandGap;
  }
  const byId = new Map(positioned.map((n) => [n.id, n]));
  return laidOutNodes.map((n) => byId.get(n.id)!);
}

const LEGEND_ITEMS = ["SOURCE", "RAW", "STAGING", "TABLE", "VIEW", "LAKEHOUSE", "SEMANTIC_MODEL", "REPORT"];
// Hop depth choices for the Upstream/Downstream pickers; 10 = "All" (the traversal functions' own cap).
const DEPTH_OPTIONS = [1, 2, 3, 4, 5, 10];

function LineageGraphInner({
  initialAssetType, initialAssetId, canManage, preserveParams = {}, reloadSignal = 0,
}: {
  initialAssetType: AssetType | null;
  initialAssetId: number | null;
  canManage: boolean;
  // Extra query params (e.g. { tab: "Lineage" }) to keep alongside assetType/assetId when
  // this graph is embedded inside a host page's own URL, rather than the standalone route.
  preserveParams?: Record<string, string>;
  // Bumped by the host page after something outside the graph changed lineage (e.g. an Excel import).
  reloadSignal?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLang();

  const [focus, setFocus] = useState<{ assetType: AssetType; assetId: number } | null>(
    initialAssetType && initialAssetId ? { assetType: initialAssetType, assetId: initialAssetId } : null,
  );
  const [scope, setScope] = useState<Scope>("ENTITY_LEVEL");
  const [upDepth, setUpDepth] = useState(2);
  const [downDepth, setDownDepth] = useState(2);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [impactDirection, setImpactDirection] = useState<"UP" | "DOWN" | null>(null);

  // Manual lineage editing (stewards/admins): the Add Lineage dialog — opened from
  // the toolbar or by dragging between two nodes — and edit/delete on an edge.
  const [addLineage, setAddLineage] = useState<{ source: PickedTable | null; target: PickedTable | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<"graph" | "table">("graph");
  const [changeImpactOpen, setChangeImpactOpen] = useState(false);
  const [reviewEdge, setReviewEdge] = useState<GraphEdge | null>(null);
  const [notice, setNotice] = useState<{ text: string; requestId: number | null } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FR-12.2: user-toggleable; effectively a no-op (single band) when the graph
  // only spans one system, which is how "default ON when >1 source" falls out
  // naturally without needing separate default-tracking state.
  const [groupBySystem, setGroupBySystem] = useState(true);
  const systemCount = useMemo(() => new Set((graph?.nodes ?? []).map((n) => n.sourceTypeCode ?? n.sourceName ?? "—")).size, [graph]);

  // ── Fetch graph on focus/scope/depth change ─────────────────────────────
  useEffect(() => {
    if (!focus) return;
    setLoading(true);
    fetch(`/api/lineage/graph?assetType=${focus.assetType}&assetId=${focus.assetId}&scope=${scope}&up=${upDepth}&down=${downDepth}`)
      .then((r) => r.json())
      .then((g: Graph) => {
        setGraph(g);
        setSelectedEntityId(g.focus.entityId);
      })
      .finally(() => setLoading(false));
    const params = new URLSearchParams({ ...preserveParams, assetType: focus.assetType, assetId: String(focus.assetId) });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, scope, upDepth, downDepth, reloadKey, reloadSignal]);



  // ── Build React Flow nodes/edges whenever graph changes ─────────────────
  const refocusToColumn = useCallback((entityId: number, attributeId: number, name: string) => {
    setScope("ATTRIBUTE_LEVEL");
    setFocus({ assetType: "DATA_ATTRIBUTES", assetId: attributeId });
  }, []);

  useEffect(() => {
    if (!graph) return;
    const rfNodes: Node[] = graph.nodes.map((n) => ({
      id: String(n.entityId),
      type: "lineageNode",
      position: { x: 0, y: 0 },
      data: {
        entityId: n.entityId, entityName: n.entityName, sourceName: n.sourceName, schemaName: n.schemaName,
        layerCode: n.layerCode, sourceTypeCode: n.sourceTypeCode,
        qualityStatus: n.qualityStatus, hasUpstreamIssue: n.hasUpstreamIssue, isCurrent: n.isCurrent,
        columnCount: n.columnCount, columns: n.columns, scope, onSelectColumn: refocusToColumn, t: t.lineage,
      } satisfies LineageNodeData,
    }));
    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: String(e.lineageId),
      source: String(e.sourceEntityId),
      target: String(e.targetEntityId),
      type: "smoothstep",
      animated: false,
      style: { stroke: e.isConfirmed ? "#6058A0" : "#94a3b8", strokeWidth: 1.75, strokeDasharray: e.provenanceCode === "SCANNED" && !e.isConfirmed ? "5 3" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: e.isConfirmed ? "#6058A0" : "#94a3b8", width: 16, height: 16 },
    }));
    let laidOut = layoutNodes(rfNodes, rfEdges);
    if (groupBySystem) {
      const systemOf = new Map(graph.nodes.map((n) => [String(n.entityId), n.sourceTypeCode ?? n.sourceName ?? "—"]));
      laidOut = applySwimlanes(laidOut, systemOf);
    }
    setNodes(laidOut);
    setEdges(rfEdges);
  }, [graph, scope, groupBySystem, refocusToColumn, setNodes, setEdges, t.lineage]);

  // ── Search typeahead ─────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => {
      fetch(`/api/lineage/search?q=${encodeURIComponent(searchQuery)}`)
        .then((r) => r.json())
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  function selectSearchResult(r: SearchResult) {
    setScope(r.assetType === "DATA_ATTRIBUTES" ? "ATTRIBUTE_LEVEL" : scope);
    setFocus({ assetType: r.assetType, assetId: r.assetId });
    setSearchOpen(false);
    setSearchQuery("");
  }

  function onNodeClick(_e: React.MouseEvent, node: Node) {
    setSelectedEntityId(Number(node.id));
    setSelectedEdge(null);
    if (Number(node.id) !== graph?.focus.entityId) {
      setFocus({ assetType: "DATA_ENTITIES", assetId: Number(node.id) });
      setScope("ENTITY_LEVEL");
    }
  }

  const pickedTable = useCallback((entityId: number | null | undefined): PickedTable | null => {
    const n = graph?.nodes.find((x) => x.entityId === entityId);
    return n ? { entityId: n.entityId, name: n.entityName, schemaName: n.schemaName } : null;
  }, [graph]);

  // Dragging from one node's right handle onto another opens the dialog prefilled.
  function onConnect(conn: Connection) {
    if (!canManage || !conn.source || !conn.target || conn.source === conn.target) return;
    setAddLineage({ source: pickedTable(Number(conn.source)), target: pickedTable(Number(conn.target)) });
  }

  function onEdgeClick(_e: React.MouseEvent, edge: Edge) {
    const full = graph?.edges.find((e) => e.lineageId === Number(edge.id));
    setSelectedEdge(full ?? null);
    setSelectedEntityId(null);
  }

  const selectedNode = useMemo(() => graph?.nodes.find((n) => n.entityId === selectedEntityId) ?? null, [graph, selectedEntityId]);
  const nodeTypes = useMemo(() => ({ lineageNode: LineageNodeCard }), []);

  if (!focus) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-canvas">
        <div className="text-4xl">🔗</div>
        <p className="text-sm text-muted max-w-sm text-center">{t.lineage.emptyPrompt}</p>
        <div className="relative w-80">
          <input
            className="input w-full"
            placeholder={t.lineage.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            autoFocus
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white border border-line rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
              {searchResults.map((r) => (
                <button key={`${r.assetType}-${r.assetId}`} onClick={() => selectSearchResult(r)} className="w-full text-left px-3 py-2 hover:bg-canvas-soft text-sm border-b border-line-soft last:border-0">
                  <span className="font-medium text-ink">
                    {r.entityName ? (r.attributeClassCode === "MEASURE" ? `${r.entityName}[${r.name}]` : `${r.entityName}.${r.name}`) : r.name}
                    {r.attributeClassCode === "MEASURE" && <span className="text-amber-600 font-bold ml-1" title="DAX measure">ƒx</span>}
                  </span>
                  {r.schemaName && <span className="text-xs text-muted ml-2">{r.schemaName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f4f6fc]">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-line shrink-0 flex-wrap">
        <div className="relative w-64">
          <input
            className="input input-sm w-full"
            placeholder={t.lineage.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-72 bg-white border border-line rounded-lg shadow-lg max-h-72 overflow-y-auto z-20">
              {searchResults.map((r) => (
                <button key={`${r.assetType}-${r.assetId}`} onMouseDown={() => selectSearchResult(r)} className="w-full text-left px-3 py-2 hover:bg-canvas-soft text-sm border-b border-line-soft last:border-0">
                  <span className="font-medium text-ink">
                    {r.entityName ? (r.attributeClassCode === "MEASURE" ? `${r.entityName}[${r.name}]` : `${r.entityName}.${r.name}`) : r.name}
                    {r.attributeClassCode === "MEASURE" && <span className="text-amber-600 font-bold ml-1" title="DAX measure">ƒx</span>}
                  </span>
                  {r.schemaName && <span className="text-xs text-muted ml-2">{r.schemaName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex rounded-lg border border-line overflow-hidden text-xs font-medium">
          <button onClick={() => setScope("ENTITY_LEVEL")} className={`px-3 py-1.5 transition-colors ${scope === "ENTITY_LEVEL" ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}>{t.lineage.tableLevel}</button>
          <button onClick={() => setScope("ATTRIBUTE_LEVEL")} className={`px-3 py-1.5 transition-colors ${scope === "ATTRIBUTE_LEVEL" ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}>{t.lineage.columnLevel}</button>
        </div>

        {([
          [t.lineageTools.upstream, upDepth, setUpDepth],
          [t.lineageTools.downstream, downDepth, setDownDepth],
        ] as const).map(([label, value, set]) => (
          <label key={label} className="flex items-center gap-1.5 rounded-lg border border-line ps-2.5 text-xs font-medium text-ink-soft bg-white">
            {label}
            <select
              value={value}
              onChange={(e) => set(Number(e.target.value))}
              className="bg-transparent border-0 border-s border-line py-1.5 ps-2 pe-1 text-xs font-semibold text-ink outline-none cursor-pointer"
            >
              {DEPTH_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 10 ? t.lineageTools.allHops : t.lineageTools.hopsOption.replace("{n}", String(n))}</option>
              ))}
            </select>
          </label>
        ))}

        <div className="flex rounded-lg border border-line overflow-hidden text-xs font-medium">
          {(["graph", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 transition-colors ${view === v ? "bg-brand-deep text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}>
              {v === "graph" ? t.lineageTools.viewGraph : t.lineageTools.viewTable}
            </button>
          ))}
        </div>

        <a
          href={`/api/lineage/export?assetType=${focus.assetType}&assetId=${focus.assetId}&scope=${scope}&up=${upDepth}&down=${downDepth}`}
          className="btn btn-sm text-xs"
        >
          ⭳ {t.lineageTools.exportExcel}
        </a>

        {systemCount > 1 && view === "graph" && (
          <button
            onClick={() => setGroupBySystem((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${groupBySystem ? "bg-brand-purple text-white border-brand-purple" : "bg-white text-ink-soft border-line hover:bg-canvas-soft"}`}
          >
            {t.lineage.groupBySystem}
          </button>
        )}

        <button onClick={() => setChangeImpactOpen(true)} className="btn btn-sm text-xs">{t.lineageTools.assessChange}</button>

        {canManage && (
          <button
            onClick={() => setAddLineage({ source: pickedTable(graph?.focus.entityId), target: null })}
            className="btn btn-primary btn-sm text-xs"
            title={t.lineageEditor.dragHint}
          >
            + {t.lineageEditor.addLineage}
          </button>
        )}

        <div className="flex items-center gap-3 ml-auto text-[11px] text-muted">
          {LEGEND_ITEMS.map((code) => (
            <span key={code} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${LAYER_DOT[code]}`} />
              {layerLabels(t.lineage)[code]}
            </span>
          ))}
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-[12px] text-emerald-700 bg-emerald-50 border-b border-emerald-200 shrink-0">
          <span>
            {notice.text}{" "}
            {notice.requestId && <Link href={`/requests/${notice.requestId}`} className="font-semibold underline">{t.lineageRegister.requestNo.replace("{id}", String(notice.requestId))}</Link>}
          </span>
          <button onClick={() => setNotice(null)} className="text-base leading-none opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* ── Canvas ── */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <div className="text-sm text-muted">{t.lineage.loadingLineage}</div>
          </div>
        )}
        {view === "table" && graph && (
          <LineageTable graph={graph} selectedId={selectedEdge?.lineageId ?? null} onSelect={(e) => { setSelectedEdge(e); setSelectedEntityId(null); }} />
        )}
        {view === "graph" && <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onConnect={onConnect}
          nodesConnectable={canManage}
          onPaneClick={() => { setSelectedEdge(null); }}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d8dcee" />
          <Controls position="bottom-center" showInteractive={false} />
        </ReactFlow>}

        {view === "graph" && <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur border border-line rounded-full px-3 py-1.5 text-[11px] text-muted shadow-sm">
          {t.lineage.canvasHint}
        </div>}

        {/* ── Detail panel ── */}
        {selectedNode && view === "graph" && (
          <div className="absolute top-4 right-4 w-64 bg-white border border-line rounded-xl shadow-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${layerLabels(t.lineage)[selectedNode.layerCode ?? ""] ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                {layerLabels(t.lineage)[selectedNode.layerCode ?? ""] ?? selectedNode.layerCode ?? "—"}
              </span>
              <EngineGlyph engineCode={selectedNode.sourceTypeCode} label={engineLabels(t.lineage)[selectedNode.sourceTypeCode ?? ""]} />
            </div>
            <div>
              <div className="text-sm font-bold text-brand-purple" dir="auto">{selectedNode.entityName}</div>
              {(selectedNode.sourceName || selectedNode.schemaName) && (
                <div className="text-[11px] text-muted mt-0.5" dir="auto">{[selectedNode.sourceName, selectedNode.schemaName].filter(Boolean).join(" › ")}</div>
              )}
              {scope === "ATTRIBUTE_LEVEL" && selectedNode.columns[0] && (
                <div className="text-xs text-muted mt-0.5">{selectedNode.columns[0].name}</div>
              )}
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted">{t.lineage.detail.quality}</span>
                <span className={`font-semibold ${selectedNode.qualityStatus === "CRITICAL" ? "text-red-600" : selectedNode.qualityStatus === "WARNING" ? "text-amber-600" : selectedNode.qualityStatus === "GOOD" ? "text-emerald-600" : "text-slate-400"}`}>
                  {selectedNode.qualityStatus === "GOOD" ? t.lineage.quality.good : selectedNode.qualityStatus === "UNKNOWN" ? t.lineage.quality.unknown : selectedNode.qualityStatus === "CRITICAL" ? t.lineage.quality.critical : t.lineage.quality.warning}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted">{t.lineage.detail.owner}</span><span className="text-ink font-medium">{selectedNode.ownerName ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted">{t.lineage.detail.rows}</span><span className="text-ink font-medium">{selectedNode.rowCountEstimate != null ? selectedNode.rowCountEstimate.toLocaleString() : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted">{t.lineage.detail.columns}</span><span className="text-ink font-medium">{selectedNode.columnCount}</span></div>
            </div>
            {selectedNode.entityId === graph?.focus.entityId && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => setImpactDirection("DOWN")} className="bg-canvas-soft hover:bg-line-soft rounded-lg p-2 text-center transition-colors">
                  <div className="text-base font-bold text-ink">{graph.counts.downstreamTotal}</div>
                  <div className="text-[10px] text-muted">{t.lineage.detail.downstream}</div>
                </button>
                <button onClick={() => setImpactDirection("UP")} className="bg-canvas-soft hover:bg-line-soft rounded-lg p-2 text-center transition-colors">
                  <div className="text-base font-bold text-ink">{graph.counts.upstreamTotal}</div>
                  <div className="text-[10px] text-muted">{t.lineage.detail.upstream}</div>
                </button>
                <button onClick={() => setChangeImpactOpen(true)} className="col-span-2 btn btn-sm text-xs">
                  {t.lineageTools.assessChange}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Edge popover ── */}
        {selectedEdge && (
          <div className="absolute top-4 right-4 w-80 bg-white border border-line rounded-xl shadow-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">{selectedEdge.transformationTypeName ?? selectedEdge.transformationTypeCode ?? t.lineage.edge.transformation}</span>
              <button onClick={() => setSelectedEdge(null)} className="text-muted hover:text-ink text-lg leading-none">×</button>
            </div>
            {(selectedEdge.sourceColumnName || selectedEdge.targetColumnName) && (
              <div className="text-[11px] text-muted">{selectedEdge.sourceColumnName ?? "?"} → {selectedEdge.targetColumnName ?? "?"}</div>
            )}
            {selectedEdge.processName && <div className="text-xs text-ink-soft">{t.lineage.edge.process} <span className="font-medium text-ink">{selectedEdge.processName}</span></div>}
            {selectedEdge.transformationLogicText && (
              <pre className="text-[11px] font-mono bg-slate-900 text-emerald-300 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words">{selectedEdge.transformationLogicText}</pre>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${selectedEdge.provenanceCode === "SCANNED" ? "bg-sky-50 text-sky-700" : "bg-purple-50 text-purple-700"}`}>
                {selectedEdge.provenanceCode === "SCANNED" ? t.lineage.edge.autoScanned : t.lineage.edge.manual}{selectedEdge.confidenceCode ? ` · ${selectedEdge.confidenceCode}` : ""}
              </span>
              {selectedEdge.isConfirmed && <span className="text-[11px] text-emerald-600 font-medium">{t.lineage.edge.confirmed}</span>}
            </div>

            {/* Not right? Ask the owners to review it — links aren't confirmed or deleted in place.
                Manual links are edited/removed (with approval) in the Mapping Asset view. */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-line-soft">
              <Link href={`/lineage?view=register&q=${encodeURIComponent(selectedEdge.targetColumnName ?? graph?.nodes.find((n) => n.entityId === selectedEdge.targetEntityId)?.entityName ?? "")}`} className="text-[12px] text-ink-soft hover:text-brand-purple hover:underline">
                {t.lineageRegister.openInRegister}
              </Link>
              <button onClick={() => setReviewEdge(selectedEdge)} className="text-[12px] font-semibold text-sky-700 hover:underline">{t.lineageRegister.actReview}</button>
            </div>

          </div>
        )}
      </div>

      {addLineage && (
        <AddLineageModal
          initialSource={addLineage.source}
          initialTarget={addLineage.target}
          onClose={() => setAddLineage(null)}
          onSaved={(res) => {
            setAddLineage(null);
            setReloadKey((k) => k + 1);
            setNotice(res?.mode === "PENDING"
              ? { text: t.lineageRegister.submittedPending.replace("{id}", String(res.requestId)), requestId: res.requestId }
              : { text: t.lineageRegister.submittedApplied, requestId: null });
          }}
        />
      )}

      {reviewEdge && (
        <ReviewRequestModal
          lineageId={reviewEdge.lineageId}
          label={`${graph?.nodes.find((n) => n.entityId === reviewEdge.sourceEntityId)?.entityName ?? "?"}${reviewEdge.sourceColumnName ? "." + reviewEdge.sourceColumnName : ""} → ${graph?.nodes.find((n) => n.entityId === reviewEdge.targetEntityId)?.entityName ?? "?"}${reviewEdge.targetColumnName ? "." + reviewEdge.targetColumnName : ""}`}
          onClose={() => setReviewEdge(null)}
        />
      )}

      {changeImpactOpen && graph && (
        <ChangeImpactPanel
          entityId={graph.focus.entityId}
          entityName={graph.nodes.find((n) => n.entityId === graph.focus.entityId)?.entityName ?? graph.focus.name}
          initialColumnId={graph.focus.assetType === "DATA_ATTRIBUTES" ? graph.focus.assetId : null}
          canManage={canManage}
          onClose={() => setChangeImpactOpen(false)}
        />
      )}

      {impactDirection && graph && (
        <ImpactReportPanel
          assetType={graph.focus.assetType}
          assetId={graph.focus.assetId}
          focusName={graph.focus.columnName ? `${graph.focus.name}.${graph.focus.columnName}` : graph.focus.name}
          direction={impactDirection}
          onClose={() => setImpactDirection(null)}
          t={t.lineage}
        />
      )}
    </div>
  );
}

// Tabular view of the same lineage the graph shows: one row per link.
function LineageTable({ graph, selectedId, onSelect }: { graph: Graph; selectedId: number | null; onSelect: (e: GraphEdge) => void }) {
  const { t } = useLang();
  const lt = t.lineageTools;
  const nodeById = new Map(graph.nodes.map((n) => [n.entityId, n]));
  const end = (entityId: number, column: string | null) => {
    const n = nodeById.get(entityId);
    return (
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink truncate" dir="auto" title={n?.entityName}>
          {n?.entityName ?? `#${entityId}`}{column ? <span className="text-brand-purple">.{column}</span> : null}
        </div>
        <div className="text-[11px] text-muted truncate" dir="auto">{[n?.sourceName, n?.schemaName].filter(Boolean).join(" · ")}</div>
      </div>
    );
  };
  if (graph.edges.length === 0) return <div className="h-full grid place-items-center text-sm text-muted bg-white">{lt.noLinks}</div>;
  return (
    <div className="h-full overflow-auto bg-white">
      <table className="w-full text-start">
        <thead className="sticky top-0 bg-canvas-soft z-[1]">
          <tr className="text-[11px] uppercase tracking-wider text-muted font-bold">
            <th className="px-4 py-2.5 text-start">{lt.tableSource}</th>
            <th className="px-1 py-2.5" />
            <th className="px-4 py-2.5 text-start">{lt.tableTarget}</th>
            <th className="px-4 py-2.5 text-start">{lt.tableTransformation}</th>
            <th className="px-4 py-2.5 text-start">{lt.tableOrigin}</th>
            <th className="px-4 py-2.5 text-start">{lt.tableLogic}</th>
          </tr>
        </thead>
        <tbody>
          {graph.edges.map((e) => (
            <tr
              key={e.lineageId}
              onClick={() => onSelect(e)}
              className={`border-t border-line-soft cursor-pointer ${selectedId === e.lineageId ? "bg-brand-purple/[0.06]" : "hover:bg-canvas-soft"}`}
            >
              <td className="px-4 py-2 max-w-[260px]">{end(e.sourceEntityId, e.sourceColumnName)}</td>
              <td className="px-1 py-2 text-muted">→</td>
              <td className="px-4 py-2 max-w-[260px]">{end(e.targetEntityId, e.targetColumnName)}</td>
              <td className="px-4 py-2 text-[12px] text-ink-soft whitespace-nowrap">{e.transformationTypeName ?? e.transformationTypeCode ?? "—"}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${e.provenanceCode === "SCANNED" ? "bg-sky-50 text-sky-700" : "bg-purple-50 text-purple-700"}`}>
                  {e.provenanceCode === "SCANNED" ? lt.scanned : lt.manualLabel}
                </span>
                {e.isConfirmed && <span className="ms-1.5 text-[11px] text-emerald-600">✓ {lt.confirmed}</span>}
              </td>
              <td className="px-4 py-2 max-w-[320px]">
                <div className="text-[11px] font-mono text-ink-soft truncate" title={e.transformationLogicText ?? undefined} dir="ltr">{e.transformationLogicText ?? ""}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LineageGraphClient(props: { initialAssetType: AssetType | null; initialAssetId: number | null; canManage: boolean; preserveParams?: Record<string, string>; reloadSignal?: number }) {
  return (
    <ReactFlowProvider>
      <LineageGraphInner {...props} />
    </ReactFlowProvider>
  );
}
