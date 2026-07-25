import Link from "next/link";
import { sql } from "@/lib/db";

type LineageLink = {
  lineageId:       number;
  sourceId:        number;
  sourceName:      string | null;
  sourceSchema:    string | null;
  targetId:        number;
  targetName:      string | null;
  targetSchema:    string | null;
  transformType:   string | null;
  transformLogic:  string | null;
  updatedAt:       string | null;
};

async function getEntityLineage(entityId: number): Promise<LineageLink[]> {
  const rows = await sql<{
    lineageId: number;
    sourceId: number; sourceName: string | null; sourceSchema: string | null;
    targetId: number; targetName: string | null; targetSchema: string | null;
    transformType: string | null; transformLogic: string | null; updatedAt: string | null;
  }[]>`
    SELECT
      dl.lineage_id             AS "lineageId",
      dl.source_asset_id        AS "sourceId",
      se.entity_name_text       AS "sourceName",
      ss.schema_name_text       AS "sourceSchema",
      dl.target_asset_id        AS "targetId",
      te.entity_name_text       AS "targetName",
      ts.schema_name_text       AS "targetSchema",
      dl.transformation_type_code  AS "transformType",
      dl.transformation_logic_text AS "transformLogic",
      dl.last_updated_timestamp::text AS "updatedAt"
    FROM bayanat.data_lineage dl
    LEFT JOIN bayanat.data_entities se ON se.entity_id = dl.source_asset_id
    LEFT JOIN bayanat.data_schemas  ss ON ss.schema_id = se.schema_id
    LEFT JOIN bayanat.data_entities te ON te.entity_id = dl.target_asset_id
    LEFT JOIN bayanat.data_schemas  ts ON ts.schema_id = te.schema_id
    WHERE (dl.source_asset_id = ${entityId} OR dl.target_asset_id = ${entityId})
      AND dl.lineage_scope_code = 'ENTITY_LEVEL'
    ORDER BY dl.last_updated_timestamp DESC NULLS LAST
  `;
  return rows;
}

function NodeBox({ name, schema, highlight }: { name: string | null; schema: string | null; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm min-w-[140px] text-center ${highlight ? "border-brand-purple bg-brand-purple/5" : "border-line bg-white"}`}>
      <div className={`font-semibold truncate ${highlight ? "text-brand-purple" : "text-ink"}`}>{name ?? "Unknown"}</div>
      {schema && <div className="text-[10px] text-muted mt-0.5">{schema}</div>}
    </div>
  );
}

function Arrow({ label }: { label: string | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2">
      <div className="w-14 h-px bg-line relative">
        <div className="absolute right-0 top-[-3px] text-muted text-[10px]">▶</div>
      </div>
      {label && <div className="text-[9px] text-muted uppercase tracking-wide">{label}</div>}
    </div>
  );
}

export async function LineageTab({ entityId, entityName }: { entityId: number; entityName: string }) {
  const links = await getEntityLineage(entityId);

  const upstream   = links.filter(l => l.targetId === entityId);
  const downstream = links.filter(l => l.sourceId === entityId);

  if (links.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🔗</div>
        <h3 className="font-semibold text-ink mb-1">No lineage recorded</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          Lineage links between tables are built automatically when views are crawled, or can be added manually by a data steward.
        </p>
        <Link
          href={`/lineage?assetType=DATA_ENTITIES&assetId=${entityId}`}
          className="mt-4 inline-block text-sm text-brand-purple hover:underline font-medium"
        >
          Open lineage graph →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Visual flow diagram */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-sm">Data Flow</h3>
          <Link
            href={`/lineage?assetType=DATA_ENTITIES&assetId=${entityId}`}
            className="text-xs text-brand-purple hover:underline font-medium"
          >
            View full lineage graph →
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Upstream sources */}
          {upstream.length > 0 && (
            <div className="flex flex-col gap-2">
              {upstream.map(l => (
                <NodeBox key={l.lineageId} name={l.sourceName} schema={l.sourceSchema} />
              ))}
            </div>
          )}

          {upstream.length > 0 && (
            <Arrow label={upstream[0].transformType} />
          )}

          {/* Current entity */}
          <NodeBox name={entityName} schema={null} highlight />

          {downstream.length > 0 && (
            <Arrow label={downstream[0].transformType} />
          )}

          {/* Downstream targets */}
          {downstream.length > 0 && (
            <div className="flex flex-col gap-2">
              {downstream.map(l => (
                <NodeBox key={l.lineageId} name={l.targetName} schema={l.targetSchema} />
              ))}
            </div>
          )}

          {upstream.length === 0 && downstream.length === 0 && (
            <span className="text-muted text-sm">No connected tables</span>
          )}
        </div>
      </div>

      {/* Detail table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line bg-canvas-soft text-[10px] uppercase tracking-wider text-muted font-bold grid grid-cols-[1fr_60px_1fr_1fr_120px]">
          <div>Source</div><div className="text-center">→</div><div>Target</div><div>Transform</div><div>Updated</div>
        </div>
        {links.map(l => (
          <div key={l.lineageId} className="grid grid-cols-[1fr_60px_1fr_1fr_120px] px-5 py-3 items-center border-b border-line-soft last:border-b-0 text-sm hover:bg-canvas-soft">
            <div>
              <span className={`font-semibold ${l.sourceId === entityId ? "text-brand-purple" : "text-ink"}`}>{l.sourceName ?? "—"}</span>
              {l.sourceSchema && <div className="text-[10px] text-muted">{l.sourceSchema}</div>}
            </div>
            <div className="text-center text-muted text-xs">→</div>
            <div>
              <span className={`font-semibold ${l.targetId === entityId ? "text-brand-purple" : "text-ink"}`}>{l.targetName ?? "—"}</span>
              {l.targetSchema && <div className="text-[10px] text-muted">{l.targetSchema}</div>}
            </div>
            <div className="text-[12px] text-muted">
              {l.transformType ?? "—"}
              {l.transformLogic && (
                <div className="font-mono text-[10px] truncate max-w-[160px]" title={l.transformLogic}>{l.transformLogic}</div>
              )}
            </div>
            <div className="text-[11px] text-muted">
              {l.updatedAt ? new Date(l.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
