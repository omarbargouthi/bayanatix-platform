"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ──────────────────────────────────────────────────────────────────────

type MindMapItem = {
  id: string;
  label: string;
  meta?: string;
  href?: string;
};

type MindMapGroup = {
  id: string;
  label: string;
  color: string;
  items: MindMapItem[];
};

type MindMapData = {
  asset: {
    id: number;
    name: string;
    rowCount: number | null;
    isView: boolean;
    description: string | null;
    assetType?: string;
  };
  groups: MindMapGroup[];
};

// ── Node data shapes ───────────────────────────────────────────────────────────

type CenterNodeData = {
  name: string;
  rowCount: number | null;
  isView: boolean;
  assetType?: string;
  description?: string | null;
};

type GroupNodeData = {
  groupId: string;
  label: string;
  color: string;
  count: number;
  expanded: boolean;
  onToggle: (id: string) => void;
};

type ItemNodeData = {
  label: string;
  meta?: string;
  color: string;
  href?: string;
};

// ── Group icons ────────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, string> = {
  terms:       "📖",
  tags:        "🏷️",
  dq:          "✓",
  requests:    "🎫",
  stewards:    "👤",
  lineage:     "⛓️",
  parentTable: "🗄️",
  openData:    "🌐",
  dataSharing: "🤝",
};

// ── Custom node: Center asset — same "current asset" card language as the
// Lineage graph's LineageNodeCard (brand-purple border/pill, badge chip).

function CenterNode({ data }: NodeProps) {
  const d = data as unknown as CenterNodeData;
  const isColumn = d.assetType === "DATA_ATTRIBUTES";
  const icon = isColumn ? "▥" : "▤";
  const badge = isColumn ? "Column" : d.isView ? "View" : "Table";
  const badgeClass = isColumn ? "bg-purple-100 text-purple-700" : d.isView ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700";

  return (
    <div className="relative rounded-xl border-2 border-brand-purple bg-white shadow-md px-3.5 py-3 w-[190px] text-center">
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />

      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-brand-purple px-2 py-0.5 rounded-full whitespace-nowrap">
        CURRENT ASSET
      </div>

      <div className="flex items-center justify-center gap-1.5 mb-1 min-w-0">
        <span className="text-sky-500 text-sm shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-brand-purple truncate" title={d.name}>{d.name}</span>
      </div>
      {d.rowCount != null && (
        <div className="text-[10px] text-slate-400">{d.rowCount.toLocaleString()} rows</div>
      )}
      {isColumn && d.description && (
        <div className="text-[10px] text-slate-400 font-mono truncate">{d.description}</div>
      )}
      <div className={`mt-1.5 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeClass}`}>
        {badge}
      </div>
    </div>
  );
}

// ── Custom node: category card — same card shell as item/center nodes instead
// of a free-floating pill, so every node in the graph reads as one family.

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const hasItems = d.count > 0;

  return (
    <div
      onClick={() => hasItems && d.onToggle(d.groupId)}
      style={{ borderColor: hasItems ? d.color : "#e2e8f0" }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 bg-white shadow-sm select-none min-w-[130px]"
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />

      <span className="text-sm shrink-0">{GROUP_ICONS[d.groupId] ?? "•"}</span>
      <span className="text-[12px] font-semibold truncate" style={{ color: hasItems ? d.color : "#94a3b8", cursor: hasItems ? "pointer" : "default" }}>
        {d.label}
      </span>
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto shrink-0"
        style={{ background: hasItems ? `${d.color}1a` : "#f1f5f9", color: hasItems ? d.color : "#94a3b8" }}
      >
        {d.count}
      </span>
      {hasItems && (
        <span className="text-[9px] shrink-0" style={{ color: d.color }}>{d.expanded ? "︿" : "⌄"}</span>
      )}
    </div>
  );
}

// ── Custom node: item card — same rounded-lg/border-slate-200 card language
// used for leaf items, matching the Lineage graph's node sizing/typography.

function ItemNode({ data }: NodeProps) {
  const d = data as unknown as ItemNodeData;
  const router = useRouter();

  return (
    <div
      onClick={() => d.href && router.push(d.href)}
      style={{ borderLeftColor: d.color }}
      className={`bg-white border border-slate-200 border-l-4 rounded-lg px-3 py-2 shadow-sm min-w-[140px] max-w-[180px] hover:shadow-md hover:border-brand-purple/40 transition-shadow ${d.href ? "cursor-pointer" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <div className="text-[12px] font-semibold text-ink truncate" title={d.label}>
        {d.label}
      </div>
      {d.meta && (
        <div className="text-[10px] text-slate-400 mt-0.5 truncate">{d.meta}</div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  centerNode: CenterNode,
  groupNode:  GroupNode,
  itemNode:   ItemNode,
};

// ── Layout helpers ─────────────────────────────────────────────────────────────

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function buildNodesAndEdges(
  data: MindMapData,
  expandedGroups: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "center",
    type: "centerNode",
    position: { x: 0, y: 0 },
    data: {
      name: data.asset.name,
      rowCount: data.asset.rowCount,
      isView: data.asset.isView,
      assetType: data.asset.assetType,
      description: data.asset.description,
    } as unknown as Record<string, unknown>,
  });

  const groupCount = data.groups.length;
  const GROUP_RADIUS = 260;
  const ITEM_RADIUS = 480;
  const MAX_ITEMS = 8;

  data.groups.forEach((group, gIdx) => {
    const angleDeg = -90 + (360 / groupCount) * gIdx;
    const angleRad = degToRad(angleDeg);
    const gx = Math.cos(angleRad) * GROUP_RADIUS;
    const gy = Math.sin(angleRad) * GROUP_RADIUS;
    const isExpanded = expandedGroups.has(group.id);

    const groupNodeId = `group-${group.id}`;

    nodes.push({
      id: groupNodeId,
      type: "groupNode",
      position: { x: gx, y: gy },
      data: {
        groupId: group.id,
        label: group.label,
        color: group.color,
        count: group.items.length,
        expanded: isExpanded,
        onToggle: () => {},
      } as unknown as Record<string, unknown>,
    });

    edges.push({
      id: `edge-center-${group.id}`,
      source: "center",
      target: groupNodeId,
      type: "smoothstep",
      style: { stroke: group.color, strokeWidth: 1.75 },
    });

    if (isExpanded && group.items.length > 0) {
      const visibleItems = group.items.slice(0, MAX_ITEMS);
      const hasMore = group.items.length > MAX_ITEMS;
      const displayItems = hasMore
        ? [...visibleItems, { id: `more-${group.id}`, label: `+${group.items.length - MAX_ITEMS} more` }]
        : visibleItems;

      const spreadDeg = Math.min(80, displayItems.length * 18);
      const startDeg = angleDeg - spreadDeg / 2;
      const stepDeg = displayItems.length > 1 ? spreadDeg / (displayItems.length - 1) : 0;

      displayItems.forEach((item, iIdx) => {
        const itemAngleDeg = displayItems.length === 1 ? angleDeg : startDeg + stepDeg * iIdx;
        const itemAngleRad = degToRad(itemAngleDeg);
        const ix = Math.cos(itemAngleRad) * ITEM_RADIUS;
        const iy = Math.sin(itemAngleRad) * ITEM_RADIUS;

        const itemNodeId = `item-${group.id}-${item.id}`;

        nodes.push({
          id: itemNodeId,
          type: "itemNode",
          position: { x: ix, y: iy },
          data: {
            label: item.label,
            meta: (item as MindMapItem).meta,
            color: group.color,
            href: (item as MindMapItem).href,
          } as unknown as Record<string, unknown>,
        });

        edges.push({
          id: `edge-${groupNodeId}-${itemNodeId}`,
          source: groupNodeId,
          target: itemNodeId,
          type: "straight",
          style: { stroke: group.color, strokeWidth: 1, opacity: 0.6 },
        });
      });
    }
  });

  return { nodes, edges };
}

// ── Inner component (uses ReactFlow hooks) ─────────────────────────────────────

function MindMapInner({
  assetId,
  assetType,
  entityName,
  height = 600,
}: {
  assetId: number;
  assetType: string;
  entityName: string;
  height?: number;
}) {
  const [data, setData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalog/mindmap?assetType=${assetType}&assetId=${assetId}`)
      .then((r) => r.json())
      .then((d: MindMapData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assetId, assetType]);

  const handleToggle = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!data) return;

    const { nodes: builtNodes, edges: builtEdges } = buildNodesAndEdges(data, expandedGroups);

    const patchedNodes = builtNodes.map((n) => {
      if (n.type === "groupNode") {
        const d = n.data as unknown as GroupNodeData;
        return {
          ...n,
          data: { ...n.data, onToggle: handleToggle, expanded: expandedGroups.has(d.groupId) } as unknown as Record<string, unknown>,
        };
      }
      return n;
    });

    setNodes(patchedNodes);
    setEdges(builtEdges);
  }, [data, expandedGroups, handleToggle, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-10 text-center">
        <h3 className="font-semibold text-ink mb-1">Failed to load relationships</h3>
      </div>
    );
  }

  const expandableGroups = data.groups.filter((g) => g.items.length > 0);
  const allEmpty = expandableGroups.length === 0;
  if (allEmpty) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🕸️</div>
        <h3 className="font-semibold text-ink mb-1">No relationships found</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          This asset has no linked business terms, tags, DQ rules, requests, stewards, or lineage yet.
        </p>
      </div>
    );
  }

  const allExpanded = expandableGroups.every((g) => expandedGroups.has(g.id));

  return (
    <div className="w-full rounded-xl overflow-hidden border border-line flex flex-col" style={{ height }}>
      {/* ── Top bar — same shell as the Lineage graph's top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-line shrink-0 flex-wrap">
        <span className="text-xs font-semibold text-ink-soft truncate max-w-[220px]" title={entityName}>
          Relationships · {entityName}
        </span>

        <div className="flex rounded-lg border border-line overflow-hidden text-xs font-medium">
          <button
            onClick={() => setExpandedGroups(new Set(expandableGroups.map((g) => g.id)))}
            className={`px-3 py-1.5 transition-colors ${allExpanded ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}
          >
            Expand all
          </button>
          <button
            onClick={() => setExpandedGroups(new Set())}
            className={`px-3 py-1.5 border-l border-line transition-colors ${expandedGroups.size === 0 ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}
          >
            Collapse all
          </button>
        </div>

        <div className="flex items-center gap-3 ml-auto text-[11px] text-muted flex-wrap">
          {data.groups.map((g) => (
            <span key={g.id} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />
              {g.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Canvas — same background/controls treatment as the Lineage graph ── */}
      <div className="flex-1 relative bg-[#f4f6fc]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodeOrigin={[0.5, 0.5]}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d8dcee" />
          <Controls position="bottom-center" showInteractive={false} />
        </ReactFlow>

        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur border border-line rounded-full px-3 py-1.5 text-[11px] text-muted shadow-sm">
          Click a category to expand · drag to pan · scroll to zoom
        </div>
      </div>
    </div>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────

export function MindMapTab({
  assetId,
  assetType,
  entityName,
  height = 600,
}: {
  assetId: number;
  assetType: string;
  entityName: string;
  height?: number;
}) {
  return (
    <ReactFlowProvider>
      <MindMapInner assetId={assetId} assetType={assetType} entityName={entityName} height={height} />
    </ReactFlowProvider>
  );
}
