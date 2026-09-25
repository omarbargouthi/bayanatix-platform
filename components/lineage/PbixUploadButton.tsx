"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang-context";

type Connection = { connectionId: number; connectionName: string; dbTypeCode: string };
type UploadResult = { scanRunId: number; edgesCreated: number; warnings: string[] };

export function PbixUploadButton() {
  const { t } = useLang();
  const c = t.lineage;
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/lineage/connections?dbTypeCode=POWERBI,FABRIC")
      .then((r) => r.json())
      .then((rows: Connection[]) => {
        setConnections(rows);
        if (rows.length > 0) setConnectionId(String(rows[0].connectionId));
      })
      .catch(() => setError(c.loadConnectionsFailed));
  }, [open]);

  async function submit() {
    if (!file || !connectionId) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("connectionId", connectionId);
      const r = await fetch("/api/lineage/pbix/upload", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? c.uploadFailedErr); return; }
      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError(c.uploadFailedErr);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-sm shrink-0">
        {c.uploadPbixBtn}
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-md">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-ink">{c.uploadPbixBtn}</span>
        <button onClick={() => { setOpen(false); setResult(null); setError(""); }} className="text-muted hover:text-ink text-xs">
          {t.common.close}
        </button>
      </div>
      <p className="text-[11px] text-muted mb-3">
        {c.uploadPbixDesc}
      </p>

      <label className="block text-[11px] font-semibold text-ink-soft mb-1">{c.attachConnectionLabel}</label>
      <select
        value={connectionId}
        onChange={(e) => setConnectionId(e.target.value)}
        className="input input-sm w-full mb-3"
      >
        {connections.length === 0 && <option value="">{c.noConnectionsOption}</option>}
        {connections.map((conn) => (
          <option key={conn.connectionId} value={conn.connectionId}>{conn.connectionName} ({conn.dbTypeCode})</option>
        ))}
      </select>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pbix"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-[12px] mb-3 w-full"
      />

      <button
        onClick={submit}
        disabled={!file || !connectionId || busy}
        className="btn btn-sm btn-primary w-full"
      >
        {busy ? c.parsingBtn : c.uploadBuildBtn}
      </button>

      {error && <div className="mt-3 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {result && (
        <div className="mt-3 text-[12px] bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <div className="font-semibold text-emerald-700 mb-1">{c.edgesCreatedSummary.replace("{n}", String(result.edgesCreated))}</div>
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-4 text-ink-soft space-y-0.5">
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
