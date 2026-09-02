"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  useInternalNode,
  BaseEdge,
  getBezierPath,
  Handle,
  Position,
  type Node,
  type Edge,
  type EdgeTypes,
  type EdgeProps,
  type NodeTypes,
  type NodeProps,
  type InternalNode,
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
  t: I18nStrings["relationships"];
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
  const badge = isColumn ? d.t.badges.column : d.isView ? d.t.badges.view : d.t.badges.table;
  const badgeClass = isColumn ? "bg-purple-100 text-purple-700" : d.isView ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700";

  return (
    <div className="relative rounded-xl border-2 border-brand-purple bg-white shadow-md px-3.5 py-3 w-[190px] text-center">
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2 !border-0" />
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2 !border-0" />

      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-brand-purple px-2 py-0.5 rounded-full whitespace-nowrap">
        {d.t.currentAsset}
      </div>

      <div className="flex items-center justify-center gap-1.5 mb-1 min-w-0">
        <span className="text-sky-500 text-sm shrink-0">{icon}</span>
        <span className="text-sm font-semibold text-brand-purple truncate" title={d.name}>{d.name}</span>
      </div>
      {d.rowCount != null && (
        <div className="text-[10px] text-slate-400">{d.t.rowsSuffix.replace("{n}", d.rowCount.toLocaleString())}</div>
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

// ── Floating edges ─────────────────────────────────────────────────────────────
// This is a radial layout (center → group → item spokes at arbitrary angles),
// unlike the Lineage graph's strict left-to-right dagre flow — so edges can't
// use fixed Left/Right handles the way Lineage's smoothstep edges do; a group
// sitting to the left of center would still draw from center's Right handle,
// looping the long way around and crossing other spokes. Instead each edge's
// endpoints are computed as the actual intersection of the line between the
// two node centers with each node's own box, so every line takes the direct
// path — the standard "floating edge" recipe for non-tree-shaped graphs.

function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode) {
  const { width, height } = intersectionNode.measured;
  const intersectionPos = intersectionNode.internals.positionAbsolute;
  const targetPos = targetNode.internals.positionAbsolute;

  const w = (width ?? 0) / 2;
  const h = (height ?? 0) / 2;
  const x2 = intersectionPos.x + w;
  const y2 = intersectionPos.y + h;
  const x1 = targetPos.x + (targetNode.measured.width ?? 0) / 2;
  const y1 = targetPos.y + (targetNode.measured.height ?? 0) / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;

  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function getEdgePosition(node: InternalNode, point: { x: number; y: number }) {
  const pos = node.internals.positionAbsolute;
  const nx = Math.round(pos.x);
  const ny = Math.round(pos.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + w - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + h - 1) return Position.Bottom;
  return Position.Top;
}

function FloatingEdge({ id, source, target, style, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const sourceIntersection = getNodeIntersection(sourceNode, targetNode);
  const targetIntersection = getNodeIntersection(targetNode, sourceNode);

  const [edgePath] = getBezierPath({
    sourceX: sourceIntersection.x,
    sourceY: sourceIntersection.y,
    sourcePosition: getEdgePosition(sourceNode, sourceIntersection),
    targetX: targetIntersection.x,
    targetY: targetIntersection.y,
    targetPosition: getEdgePosition(targetNode, targetIntersection),
  });

  return <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />;
}

const edgeTypes: EdgeTypes = { floating: FloatingEdge };

// ── Layout helpers ─────────────────────────────────────────────────────────────

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function buildNodesAndEdges(
  data: MindMapData,
  expandedGroups: Set<string>,
  t: I18nStrings["relationships"],
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
      t,
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
    const groupLabel = t.groups[group.id as keyof typeof t.groups] ?? group.label;

    nodes.push({
      id: groupNodeId,
      type: "groupNode",
      position: { x: gx, y: gy },
      data: {
        groupId: group.id,
        label: groupLabel,
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
      type: "floating",
      style: { stroke: group.color, strokeWidth: 1.75 },
      markerEnd: { type: MarkerType.ArrowClosed, color: group.color, width: 14, height: 14 },
    });

    if (isExpanded && group.items.length > 0) {
      const visibleItems = group.items.slice(0, MAX_ITEMS);
      const hasMore = group.items.length > MAX_ITEMS;
      const displayItems = hasMore
        ? [...visibleItems, { id: `more-${group.id}`, label: t.moreSuffix.replace("{n}", String(group.items.length - MAX_ITEMS)) }]
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
          type: "floating",
          style: { stroke: group.color, strokeWidth: 1.25, opacity: 0.65 },
          markerEnd: { type: MarkerType.ArrowClosed, color: group.color, width: 10, height: 10 },
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
  const { t } = useLang();
  const [data, setData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalog/mindmap?assetType=${assetType}&assetId=${assetId}`)
      .then((r) => r.json())
      .then((d: MindMapData) => {
        setData(d);
        setVisibleGroups(new Set(d.groups.map((g) => g.id)));
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

  const toggleGroupVisible = useCallback((groupId: string) => {
    setVisibleGroups((prev) => {
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

    const filteredData: MindMapData = { ...data, groups: data.groups.filter((g) => visibleGroups.has(g.id)) };
    const { nodes: builtNodes, edges: builtEdges } = buildNodesAndEdges(filteredData, expandedGroups, t.relationships);

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
  }, [data, expandedGroups, visibleGroups, handleToggle, setNodes, setEdges, t.relationships]);

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
        <h3 className="font-semibold text-ink mb-1">{t.relationships.loadFailed}</h3>
      </div>
    );
  }

  const expandableGroups = data.groups.filter((g) => g.items.length > 0);
  const allEmpty = expandableGroups.length === 0;
  if (allEmpty) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🕸️</div>
        <h3 className="font-semibold text-ink mb-1">{t.relationships.emptyTitle}</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          {t.relationships.emptyDesc}
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
          {t.relationships.tabTitlePrefix} · {entityName}
        </span>

        <div className="flex rounded-lg border border-line overflow-hidden text-xs font-medium">
          <button
            onClick={() => setExpandedGroups(new Set(expandableGroups.map((g) => g.id)))}
            className={`px-3 py-1.5 transition-colors ${allExpanded ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}
          >
            {t.relationships.expandAll}
          </button>
          <button
            onClick={() => setExpandedGroups(new Set())}
            className={`px-3 py-1.5 border-l border-line transition-colors ${expandedGroups.size === 0 ? "bg-brand-purple text-white" : "bg-white text-ink-soft hover:bg-canvas-soft"}`}
          >
            {t.relationships.collapseAll}
          </button>
        </div>

        <div className="flex items-center gap-3 ml-auto text-[11px] text-muted flex-wrap">
          {data.groups.map((g) => {
            const isVisible = visibleGroups.has(g.id);
            const groupLabel = t.relationships.groups[g.id as keyof typeof t.relationships.groups] ?? g.label;
            return (
              <label
                key={g.id}
                className={`flex items-center gap-1.5 cursor-pointer select-none transition-opacity ${isVisible ? "" : "opacity-40"}`}
                title={isVisible ? t.relationships.hideCategory.replace("{name}", groupLabel) : t.relationships.showCategory.replace("{name}", groupLabel)}
              >
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => toggleGroupVisible(g.id)}
                  className="w-3 h-3 rounded border-line cursor-pointer"
                  style={{ accentColor: g.color }}
                />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />
                {groupLabel}
              </label>
            );
          })}
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
          edgeTypes={edgeTypes}
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
          {t.relationships.canvasHint}
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
