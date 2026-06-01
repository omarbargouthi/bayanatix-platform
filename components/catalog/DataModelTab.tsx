"use client";

import { useEffect, useState } from "react";
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
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ──────────────────────────────────────────────────────────────────────

type Column = {
  attributeId: number;
  name: string;
  dataType: string | null;
  isPk: boolean;
  isNullable: boolean;
};

type EntityData = {
  entityId: number;
  entityName: string;
  rowCount: number | null;
  isView: boolean;
  columns: Column[];
};

type EdgeData = {
  id: string;
  sourceId: number;
  targetId: number;
  label?: string | null;
};

type DataModelResponse = {
  schemaName: string;
  entities: EntityData[];
  edges: EdgeData[];
};

// ── Node data ──────────────────────────────────────────────────────────────────

type EntityCardData = {
  entity: EntityData;
  expanded: boolean;
  onToggle: (id: number) => void;
};

// ── Entity card node ───────────────────────────────────────────────────────────

const COLS_VISIBLE = 5;

function EntityCardNode({ data }: NodeProps) {
  const d = data as unknown as EntityCardData;
  const { entity, expanded, onToggle } = d;
  const extraCount = entity.columns.length - COLS_VISIBLE;

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
      style={{ width: 220 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 cursor-pointer rounded-t-xl"
        style={{ background: entity.isView ? "#eef2ff" : "#f0fdf4" }}
        onClick={() => onToggle(entity.entityId)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm">{entity.isView ? "👁️" : "🗄️"}</span>
          <span
            className="text-[12px] font-bold truncate"
            style={{ color: entity.isView ? "#4338ca" : "#166534" }}
            title={entity.entityName}
          >
            {entity.entityName}
          </span>
        </div>
        {entity.rowCount != null && (
          <span className="text-[9px] bg-white border border-gray-200 px-1.5 py-0.5 rounded-full text-gray-500 shrink-0 ml-1">
            {entity.rowCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Column list */}
      {expanded && (
        <div className="py-1">
          {entity.columns.slice(0, COLS_VISIBLE).map((col) => (
            <div
              key={col.attributeId}
              className="flex items-center gap-1.5 px-3 py-1 hover:bg-gray-50"
            >
              {col.isPk ? (
                <span className="text-[10px] text-amber-500 shrink-0">🔑</span>
              ) : (
                <span className="text-[10px] text-gray-300 shrink-0">·</span>
              )}
              <span className="text-[11px] text-gray-700 truncate flex-1" title={col.name}>
                {col.name}
              </span>
              {col.dataType && (
                <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono shrink-0">
                  {col.dataType}
                </span>
              )}
            </div>
          ))}
          {extraCount > 0 && (
            <div className="px-3 py-1 text-[10px] text-gray-400 text-center">
              ▼ +{extraCount} columns
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  entityCard: EntityCardNode,
};

// ── Layout ─────────────────────────────────────────────────────────────────────

const COLS_PER_ROW = 3;
const COL_WIDTH = 330;
const ROW_HEIGHT = 250;

function buildNodes(
  entities: EntityData[],
  expandedEntities: Set<number>,
  onToggle: (id: number) => void
): Node[] {
  return entities.map((entity, i) => ({
    id: `entity-${entity.entityId}`,
    type: "entityCard",
    position: {
      x: (i % COLS_PER_ROW) * COL_WIDTH,
      y: Math.floor(i / COLS_PER_ROW) * ROW_HEIGHT,
    },
    data: {
      entity,
      expanded: expandedEntities.has(entity.entityId),
      onToggle,
    } as unknown as Record<string, unknown>,
  }));
}

function buildEdges(rawEdges: EdgeData[]): Edge[] {
  return rawEdges.map((e) => ({
    id: e.id,
    source: `entity-${e.sourceId}`,
    target: `entity-${e.targetId}`,
    type: "smoothstep",
    animated: false,
    label: e.label ?? undefined,
    labelStyle: { fontSize: 10, fill: "#6b7280", fontFamily: "monospace" },
    labelBgStyle: { fill: "#f9fafb" },
    style: { stroke: "#9ca3af", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af", width: 14, height: 14 },
  }));
}

// ── Inner component ────────────────────────────────────────────────────────────

function DataModelInner({ schemaId }: { schemaId: number }) {
  const [modelData, setModelData] = useState<DataModelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalog/data-model?schemaId=${schemaId}`)
      .then((r) => r.json())
      .then((d: DataModelResponse) => {
        setModelData(d);
        setExpandedEntities(new Set(d.entities.map((e) => e.entityId)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [schemaId]);

  useEffect(() => {
    if (!modelData) return;

    const onToggle = (entityId: number) => {
      setExpandedEntities((prev) => {
        const next = new Set(prev);
        if (next.has(entityId)) {
          next.delete(entityId);
        } else {
          next.add(entityId);
        }
        return next;
      });
    };

    setNodes(buildNodes(modelData.entities, expandedEntities, onToggle));
    setEdges(buildEdges(modelData.edges));
  }, [modelData, expandedEntities, setNodes, setEdges]);

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height: 600 }}>
        <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!modelData || modelData.entities.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🗄️</div>
        <h3 className="font-semibold text-ink mb-1">No tables found</h3>
        <p className="text-sm text-muted">This schema has no entities registered in the catalog.</p>
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
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
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

export function DataModelTab({ schemaId }: { schemaId: number }) {
  return (
    <ReactFlowProvider>
      <DataModelInner schemaId={schemaId} />
    </ReactFlowProvider>
  );
}
