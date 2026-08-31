"use client";

import { useEffect, useState, useCallback } from "react";

type ExternalRef = { engine: string; host: string | null; database: string | null; schema: string | null; object: string; column?: string | null };
type Candidate = { connectionId: number; connectionName: string };
type QueueRow = {
  stitchId: number; externalRef: ExternalRef; candidateConnections: Candidate[]; statusCode: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string; placeholderEntityId: number | null; placeholderEntityName: string | null; affectedEdgeCount: number;
};

function refLabel(ref: ExternalRef): string {
  const parts = [ref.engine, ref.host ?? "?", ref.database ?? "?", ref.schema, ref.object].filter(Boolean);
  return parts.join(" / ") + (ref.column ? `.${ref.column}` : "");
}

export function StitchingReviewClient() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [assetIdInputs, setAssetIdInputs] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/lineage/stitching")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setError("Failed to load the stitching queue"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(stitchId: number, body: { action: "BIND" | "ALIAS" | "DISMISS"; connectionId?: number; assetId?: number }) {
    setBusyId(stitchId);
    setError("");
    try {
      const r = await fetch(`/api/lineage/stitching/${stitchId}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Action failed"); return; }
      load();
    } finally {
      setBusyId(null);
    }
  }

  const openRows = rows.filter((r) => r.statusCode === "OPEN");
  const resolvedRows = rows.filter((r) => r.statusCode !== "OPEN");

  if (loading) return <div className="py-16 text-center text-muted text-sm">Loading…</div>;

  return (
    <div className="space-y-6">
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {openRows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm font-semibold text-ink mb-1">Nothing to review</p>
          <p className="text-[12px] text-muted">Every unresolved reference from a scan lands here — nothing is queued right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {openRows.map((row) => (
            <div key={row.stitchId} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-mono text-[13px] font-semibold text-brand-deep truncate">{refLabel(row.externalRef)}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Placeholder: <span className="font-medium text-ink-soft">{row.placeholderEntityName ?? "—"}</span>
                    {" · "}{row.affectedEdgeCount} affected edge{row.affectedEdgeCount === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  onClick={() => resolve(row.stitchId, { action: "DISMISS" })}
                  disabled={busyId === row.stitchId}
                  className="btn btn-sm shrink-0"
                >
                  Dismiss
                </button>
              </div>

              {row.candidateConnections.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[11px] text-muted">Same-engine connections:</span>
                  {row.candidateConnections.map((c) => (
                    <span key={c.connectionId} className="inline-flex items-center gap-1 bg-canvas-soft border border-line rounded-full pl-2.5 pr-1 py-0.5">
                      <span className="text-[11px] text-ink">{c.connectionName}</span>
                      <button
                        onClick={() => resolve(row.stitchId, { action: "BIND", connectionId: c.connectionId })}
                        disabled={busyId === row.stitchId}
                        className="text-[10px] font-semibold text-brand-purple hover:underline px-1"
                      >
                        Bind
                      </button>
                      <button
                        onClick={() => resolve(row.stitchId, { action: "ALIAS", connectionId: c.connectionId })}
                        disabled={busyId === row.stitchId}
                        className="text-[10px] font-semibold text-ink-soft hover:underline px-1"
                        title="Remember this host/database as an alias for this connection, for future scans"
                      >
                        Alias
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line-soft">
                <input
                  type="number"
                  placeholder="Bind to a specific asset ID"
                  className="input input-sm w-52"
                  value={assetIdInputs[row.stitchId] ?? ""}
                  onChange={(e) => setAssetIdInputs((p) => ({ ...p, [row.stitchId]: e.target.value }))}
                />
                <button
                  onClick={() => resolve(row.stitchId, { action: "BIND", assetId: Number(assetIdInputs[row.stitchId]) })}
                  disabled={busyId === row.stitchId || !assetIdInputs[row.stitchId]}
                  className="btn btn-sm btn-primary"
                >
                  Bind to asset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolvedRows.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2">Resolved / Dismissed</h2>
          <div className="space-y-1.5">
            {resolvedRows.map((row) => (
              <div key={row.stitchId} className="flex items-center gap-3 text-[12px] text-muted px-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${row.statusCode === "RESOLVED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.statusCode}</span>
                <span className="font-mono truncate">{refLabel(row.externalRef)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
