"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState, Handle, Position,
  type Node, type Edge, type NodeTypes, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { toPng } from "html-to-image";

// Deferred spec FR-3.1–3.3: graph view from any asset (core or custom), filters,
// PNG export. Flat dagre-laid-out graph (not MindMapTab's radial expandable-group
// format) — dagre handles true multi-hop depth (1-3) naturally, where a fixed-hop
// radial layout doesn't extend cleanly. "Saved views" are shareable URLs only
// (filters live in the query string) rather than a persisted named-view table.

type GraphApiNode = {
  id: string; assetType: string; assetId: number; label: string; href: string | null;
  isCenter: boolean; color: string; classification: string | null; isPii: boolean;
};
type GraphApiEdge = { id: string; source: string; target: string; label: string; relCode: string };
type GraphResponse = { nodes: GraphApiNode[]; edges: GraphApiEdge[]; truncated: boolean };

const NODE_W = 190;
const NODE_H = 66;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 } };
  });
}

type CardData = { label: string; href: string | null; isCenter: boolean; color: string; assetType: string; isPii: boolean; onNavigate: (href: string) => void };

function AssetCard({ data }: NodeProps) {
  const d = data as unknown as CardData;
  return (
    <div
      onClick={() => d.href && d.onNavigate(d.href)}
      className={`bg-white border ${d.isCenter ? "border-2 border-brand-purple" : "border border-slate-200"} border-l-4 rounded-lg px-3 py-2 shadow-sm hover:shadow-md transition-shadow ${d.href ? "cursor-pointer" : ""}`}
      style={{ width: NODE_W, borderLeftColor: d.color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-ink truncate flex-1" title={d.label}>{d.label}</span>
        {d.isPii && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700 shrink-0">PII</span>}
      </div>
      <div className="text-[10px] text-slate-400 truncate">{d.assetType.replace("CUSTOM:", "").replace("DATA_", "")}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = { assetCard: AssetCard };

const CORE_TYPE_LABELS: Record<string, string> = {
  DATA_SOURCES: "Source", DATA_SCHEMAS: "Schema", DATA_ENTITIES: "Table", DATA_ATTRIBUTES: "Column",
};

function assetTypeLabel(assetType: string): string {
  if (assetType.startsWith("CUSTOM:")) {
    const code = assetType.slice("CUSTOM:".length);
    return code.charAt(0) + code.slice(1).toLowerCase();
  }
  return CORE_TYPE_LABELS[assetType] ?? assetType;
}

function GraphInner({ assetType, assetId, height }: { assetType: string; assetId: number; height: number }) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [depth, setDepth] = useState(1);
  const [onlyPii, setOnlyPii] = useState(false);
  const [asOf, setAsOf] = useState("");
  const [relTypeFilter, setRelTypeFilter] = useState<Set<string>>(new Set());
  const [assetTypeFilter, setAssetTypeFilter] = useState<Set<string>>(new Set());
  const [availableRelTypes, setAvailableRelTypes] = useState<{ code: string; label: string }[]>([]);
  const [availableAssetTypes, setAvailableAssetTypes] = useState<string[]>([]);

  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ assetType, assetId: String(assetId), depth: String(depth) });
    if (onlyPii) params.set("onlyPii", "true");
    if (asOf) params.set("asOf", asOf);
    if (relTypeFilter.size > 0) params.set("relTypes", [...relTypeFilter].join(","));
    if (assetTypeFilter.size > 0) params.set("assetTypes", [...assetTypeFilter].join(","));
    try {
      const r = await fetch(`/api/custom-assets/graph?${params.toString()}`);
      if (r.ok) {
        const d: GraphResponse = await r.json();
        setData(d);
        // Populate filter option lists only from the very first, unfiltered load.
        setAvailableRelTypes((prev) => prev.length > 0 ? prev : [...new Map(d.edges.map((e) => [e.relCode, e.label])).entries()].map(([code, label]) => ({ code, label })));
        setAvailableAssetTypes((prev) => prev.length > 0 ? prev : [...new Set(d.nodes.map((n) => n.assetType))]);
      }
    } finally {
      setLoading(false);
    }
  }, [assetType, assetId, depth, onlyPii, asOf, relTypeFilter, assetTypeFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data) return;
    const rfNodes: Node[] = data.nodes.map((n) => ({
      id: n.id, type: "assetCard", position: { x: 0, y: 0 },
      data: { label: n.label, href: n.href, isCenter: n.isCenter, color: n.color, assetType: n.assetType, isPii: n.isPii, onNavigate: (href: string) => router.push(href) } as unknown as Record<string, unknown>,
    }));
    const rfEdges: Edge[] = data.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "smoothstep", label: e.label,
      style: { stroke: "#94a3b8", strokeWidth: 1.5 }, labelStyle: { fontSize: 10, fill: "#64748b" },
    }));
    setNodes(layoutNodes(rfNodes, rfEdges));
    setEdges(rfEdges);
  }, [data, router, setNodes, setEdges]);

  function toggleSet(set: Set<string>, setSet: (s: Set<string>) => void, value: string) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setSet(next);
  }

  async function exportPng() {
    if (!wrapperRef.current) return;
    const dataUrl = await toPng(wrapperRef.current, { backgroundColor: "#f4f6fc", pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = `relationship-graph-${assetType.toLowerCase().replace(":", "-")}-${assetId}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <div className="w-full rounded-xl overflow-hidden border border-line flex flex-col" style={{ height }}>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-line shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted">Depth</span>
          {[1, 2, 3].map((d) => (
            <button key={d} onClick={() => setDepth(d)} className={`w-6 h-6 rounded ${depth === d ? "bg-brand-purple text-white" : "bg-canvas-soft text-ink-soft hover:bg-canvas"}`}>{d}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={onlyPii} onChange={(e) => setOnlyPii(e.target.checked)} />
          Only PII columns
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          As of
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-line rounded px-1.5 py-0.5 text-xs" />
        </label>
        {availableRelTypes.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-muted">Relationship</span>
            {availableRelTypes.map((rt) => (
              <button key={rt.code} onClick={() => toggleSet(relTypeFilter, setRelTypeFilter, rt.code)}
                className={`px-2 py-0.5 rounded-full border ${relTypeFilter.size === 0 || relTypeFilter.has(rt.code) ? "border-brand-purple text-brand-purple bg-brand-purple/5" : "border-line text-muted"}`}>
                {rt.label}
              </button>
            ))}
          </div>
        )}
        {availableAssetTypes.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="text-muted">Asset type</span>
            {availableAssetTypes.map((at) => (
              <button key={at} onClick={() => toggleSet(assetTypeFilter, setAssetTypeFilter, at)}
                className={`px-2 py-0.5 rounded-full border ${assetTypeFilter.size === 0 || assetTypeFilter.has(at) ? "border-brand-purple text-brand-purple bg-brand-purple/5" : "border-line text-muted"}`}>
                {assetTypeLabel(at)}
              </button>
            ))}
          </div>
        )}
        <button onClick={exportPng} className="ml-auto btn btn-sm text-xs">⭳ Export PNG</button>
      </div>

      {data?.truncated && (
        <div className="px-4 py-1.5 text-[11px] bg-amber-50 text-amber-700 border-b border-amber-200">
          Graph truncated at 500 nodes — narrow the filters or depth to see more.
        </div>
      )}

      <div className="flex-1 relative bg-[#f4f6fc]" ref={wrapperRef}>
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
          </div>
        ) : nodes.length <= 1 ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">🕸️</div>
              <p className="text-sm text-muted">No relationships to show.</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d8dcee" />
            <Controls position="bottom-center" showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export function RelationshipGraphTab({ assetType, assetId, height = 520 }: { assetType: string; assetId: number; height?: number }) {
  return (
    <ReactFlowProvider>
      <GraphInner assetType={assetType} assetId={assetId} height={height} />
    </ReactFlowProvider>
  );
}
