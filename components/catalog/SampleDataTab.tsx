"use client";

import { useState, useEffect, useCallback } from "react";
import { RequestPiAccessModal } from "./RequestPiAccessModal";

type ApiResponse =
  | { authorized: false }
  | { authorized: true; live: false; reason: string; sampleRecordCount: number }
  | {
      authorized: true; live: true; sampleRecordCount: number;
      columns: string[]; rows: Record<string, unknown>[];
      piColumns: string[]; canViewClearText: boolean;
      piEligible: boolean; piGranted: boolean; pendingRequestId: number | null;
    };

export function SampleDataTab({ entityId, entityName }: { entityId: number; entityName: string }) {
  const [data, setData]       = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [submitted, setSubmitted]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/catalog/entities/${entityId}/sample-data`);
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !data) {
    return <div className="card p-10 text-center text-muted text-sm">Loading sample data…</div>;
  }

  if (!data.authorized) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="font-semibold text-ink mb-1">No Data Read Access</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          You don&apos;t have the Data Read privilege on this table&apos;s data source. Ask an admin to grant it to
          your role under Admin &gt; User Management &gt; Roles.
        </p>
      </div>
    );
  }

  if (!data.live) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">🔬</div>
        <h3 className="font-semibold text-ink mb-1">Sample Data</h3>
        <p className="text-sm text-muted max-w-sm mx-auto">
          Live sample data preview requires a direct connection to the source database. Enable this feature from the
          Data Sources connection settings.
        </p>
      </div>
    );
  }

  const { columns, rows, piColumns, canViewClearText, piEligible, piGranted, pendingRequestId, sampleRecordCount } = data;
  const hasPiColumns = piColumns.length > 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-canvas-soft">
        <div>
          <h3 className="font-bold text-sm text-ink">
            {rows.length.toLocaleString()} record{rows.length !== 1 ? "s" : ""}
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            Configured limit: {sampleRecordCount} · {entityName}
          </p>
        </div>

        {hasPiColumns && !canViewClearText && (
          <div className="flex items-center gap-2">
            {pendingRequestId ? (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                PI access request pending approval
              </span>
            ) : submitted ? (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Request submitted
              </span>
            ) : piEligible ? (
              <button onClick={() => setShowRequest(true)} className="btn btn-sm">
                🔓 Request PI Clear-Text Access
              </button>
            ) : (
              <span className="text-[11px] text-muted">PI columns are masked</span>
            )}
          </div>
        )}
        {hasPiColumns && canViewClearText && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            🔓 PI clear-text access granted
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas-soft border-b border-line">
              {columns.map((c) => (
                <th key={c} className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-muted font-bold whitespace-nowrap">
                  {c}
                  {piColumns.includes(c) && <span className="ml-1 text-red-500" title="PI/PII column">●</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-line-soft last:border-0 hover:bg-canvas-soft">
                {columns.map((c) => (
                  <td key={c} className={`px-4 py-2 whitespace-nowrap ${piColumns.includes(c) && !canViewClearText ? "text-muted tracking-widest" : "text-ink"}`}>
                    {row[c] === null || row[c] === undefined ? <span className="text-muted italic">null</span> : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted text-sm">No rows in this table.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showRequest && (
        <RequestPiAccessModal
          entityId={entityId}
          entityName={entityName}
          onClose={() => setShowRequest(false)}
          onSubmitted={() => { setShowRequest(false); setSubmitted(true); void load(); }}
        />
      )}
    </div>
  );
}
