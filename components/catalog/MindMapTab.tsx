"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
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
  };
  groups: MindMapGroup[];
};

// ── Node data shapes ───────────────────────────────────────────────────────────

type CenterNodeData = {
  name: string;
  rowCount: number | null;
  isView: boolean;
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
  onNavigate?: (href: string) => void;
};

// ── Group icons ────────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, string> = {
  terms:    "📖",
  tags:     "🏷️",
  dq:       "✓",
  requests: "🎫",
  stewards: "👤",
  lineage:  "⛓️",
};

// ── Custom node: Center asset ──────────────────────────────────────────────────

function CenterNode({ data }: NodeProps) {
  const d = data as unknown as CenterNodeData;
  return (
    <div
      style={{ borderColor: "#201C55", width: 160 }}
      className="bg-white border-2 rounded-xl shadow-lg px-4 py-3 text-center"
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="text-lg mb-1">🗄️</div>
      <div className="font-bold text-[13px] text-[#201C55] truncate" title={d.name}>
        {d.name}
      </div>
      {d.rowCount != null && (
        <div className="text-[10px] text-gray-500 mt-0.5">
          {d.rowCount.toLocaleString()} rows
        </div>
      )}
      <div
        className="mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block"
        style={{ background: d.isView ? "#e0e7ff" : "#f0fdf4", color: d.isView ? "#4338ca" : "#166534" }}
      >
        {d.isView ? "View" : "Table"}
      </div>
    </div>
  );
}

// ── Custom node: Group pill ────────────────────────────────────────────────────

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const hasItems = d.count > 0;

  return (
    <div
      onClick={() => hasItems && d.onToggle(d.groupId)}
      style={{ borderColor: d.color, cursor: hasItems ? "pointer" : "default" }}
      className="flex items-center gap-2 px-3 py-2 rounded-full border-2 bg-white shadow-md select-none min-w-[120px]"
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <span className="text-base">{GROUP_ICONS[d.groupId] ?? "•"}</span>
      <span
        className="text-[12px] font-semibold"
        style={{ color: hasItems ? d.color : "#9ca3af" }}
      >
        {d.label}
      </span>
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{
          background: hasItems ? d.color + "22" : "#f3f4f6",
          color: hasItems ? d.color : "#9ca3af",
        }}
      >
        {d.count}
      </span>
      {hasItems && (
        <span className="text-[10px]" style={{ color: d.color }}>
          {d.expanded ? "▲" : "▼"}
        </span>
      )}
    </div>
  );
}

// ── Custom node: Item card ─────────────────────────────────────────────────────

function ItemNode({ data }: NodeProps) {
  const d = data as unknown as ItemNodeData;
  const router = useRouter();

  return (
    <div
      onClick={() => d.href && router.push(d.href)}
      style={{
        borderLeftColor: d.color,
        cursor: d.href ? "pointer" : "default",
      }}
      className="bg-white border border-gray-200 border-l-4 rounded-lg px-3 py-2 shadow-sm min-w-[140px] max-w-[180px] hover:shadow-md transition-shadow"
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="text-[12px] font-semibold text-gray-800 truncate" title={d.label}>
        {d.label}
      </div>
      {d.meta && (
        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{d.meta}</div>
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
      style: { stroke: group.color, strokeWidth: 2 },
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
}: {
  assetId: number;
  assetType: string;
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
      <div className="w-full flex items-center justify-center" style={{ height: 600 }}>
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

  const allEmpty = data.groups.every((g) => g.items.length === 0);
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

  return (
    <div className="w-full rounded-xl overflow-hidden border border-line" style={{ height: 600 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────

export function MindMapTab({
  assetId,
  assetType,
  entityName,
}: {
  assetId: number;
  assetType: string;
  entityName: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-ink">
          Relationships — {entityName}
        </h3>
        <p className="text-[11px] text-muted">Click a group to expand its items</p>
      </div>
      <ReactFlowProvider>
        <MindMapInner assetId={assetId} assetType={assetType} />
      </ReactFlowProvider>
    </div>
  );
}
