"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

type DescRow = {
  suggestionId: number; assetType: string; assetId: number; assetName: string; entityName: string | null;
  schemaId: number | null; modeCode: string; suggestedText: string; originalText: string | null;
  status: string; currentOfficialText: string | null; drift: boolean; modelRef: string | null; createdAt: string;
};

type DqRow = {
  suggestionId: number; assetType: string; assetId: number; assetName: string; entityName: string | null;
  schemaId: number | null; dimensionCode: string | null; ruleName: string | null; ruleTemplateCode: string | null;
  severity: string; provenance: string; status: string; createdAt: string;
};

function assetHref(assetType: string, entityId: number, schemaId: number | null): string {
  if (!schemaId) return "#";
  return `/catalog/${schemaId}/tables/${entityId}`;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  ACCEPTED_EDITED: "bg-emerald-100 text-emerald-700",
  DISCARDED: "bg-red-100 text-red-700",
  SUPERSEDED: "bg-gray-100 text-gray-500",
  DUPLICATE: "bg-amber-100 text-amber-700",
};

export function EnrichmentReviewClient({ canEdit }: { canEdit: boolean }) {
  const { t } = useLang();
  const e = t.enrichment;

  const [tab, setTab] = useState<"descriptions" | "dq">("descriptions");
  const [status, setStatus] = useState("PENDING");
  const [descRows, setDescRows] = useState<DescRow[]>([]);
  const [dqRows, setDqRows] = useState<DqRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setChecked(new Set());
    try {
      if (tab === "descriptions") {
        const res = await fetch(`/api/enrichment/descriptions?status=${status}&limit=100`);
        const data = await res.json();
        setDescRows(data.data ?? []); setTotal(data.total ?? 0);
      } else {
        const res = await fetch(`/api/enrichment/dq?status=${status}&limit=100`);
        const data = await res.json();
        setDqRows(data.data ?? []); setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, status]);

  useEffect(() => { void load(); }, [load]);

  function toggle(id: number) {
    setChecked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function acceptDesc(id: number) {
    await fetch(`/api/enrichment/descriptions/${id}/accept`, { method: "POST" });
    await load();
  }
  async function discardDesc(id: number) {
    await fetch(`/api/enrichment/descriptions/${id}/discard`, { method: "POST" });
    await load();
  }
  async function acceptDq(id: number) {
    await fetch(`/api/enrichment/dq/${id}/accept`, { method: "POST" });
    await load();
  }
  async function discardDq(id: number) {
    await fetch(`/api/enrichment/dq/${id}/discard`, { method: "POST" });
    await load();
  }

  async function bulkAccept() {
    if (checked.size === 0) return;
    setBulkBusy(true);
    try {
      const endpoint = tab === "descriptions" ? "/api/enrichment/descriptions/bulk-accept" : "/api/enrichment/dq/bulk-accept";
      await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_ids: [...checked] }),
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-canvas-soft rounded-lg p-1">
          <button onClick={() => setTab("descriptions")} className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${tab === "descriptions" ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}>
            {e.tabDescriptions}
          </button>
          <button onClick={() => setTab("dq")} className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${tab === "dq" ? "bg-white text-brand-purple shadow-sm" : "text-muted"}`}>
            {e.tabDqRules}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={(ev) => setStatus(ev.target.value)} className="text-[12px] border border-line rounded-md px-2 py-1.5">
            <option value="PENDING">PENDING</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="ACCEPTED_EDITED">ACCEPTED_EDITED</option>
            <option value="DISCARDED">DISCARDED</option>
            {tab === "dq" && <option value="DUPLICATE">DUPLICATE</option>}
          </select>
          <span className="text-[12px] text-muted">{total}</span>
          {canEdit && checked.size > 0 && (
            <button onClick={bulkAccept} disabled={bulkBusy} className="btn btn-sm disabled:opacity-50">
              {bulkBusy ? "…" : `${e.bulkAccept} (${checked.size})`}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted text-sm py-10">Loading…</div>
      ) : tab === "descriptions" ? (
        descRows.length === 0 ? (
          <div className="text-center text-muted text-sm py-10">No suggestions.</div>
        ) : (
          <div className="space-y-1.5">
            {descRows.map((r) => (
              <div key={r.suggestionId} className="border border-line rounded-lg px-3 py-2.5">
                <div className="flex items-start gap-3">
                  {canEdit && status === "PENDING" && (
                    <input type="checkbox" checked={checked.has(r.suggestionId)} onChange={() => toggle(r.suggestionId)} className="mt-1 w-3.5 h-3.5 accent-brand-purple" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link href={assetHref(r.assetType, r.entityName ? r.assetId : r.assetId, r.schemaId)} className="text-[12px] font-semibold text-brand-deep hover:text-brand-purple hover:underline">
                        {r.entityName ? `${r.entityName}.${r.assetName}` : r.assetName}
                      </Link>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-gray-100"}`}>{r.status}</span>
                      {r.drift && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700" title={e.driftWarning}>{e.driftWarning}</span>}
                      <span className="text-[10px] text-muted">{r.modeCode}</span>
                    </div>
                    <p className="text-[12px] text-ink-soft mt-1">{r.suggestedText}</p>
                  </div>
                  {canEdit && r.status === "PENDING" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => acceptDesc(r.suggestionId)} className="text-[11px] font-semibold text-emerald-700 hover:underline">{e.accept}</button>
                      <button onClick={() => discardDesc(r.suggestionId)} className="text-[11px] font-medium text-red-600 hover:underline">{e.discard}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : dqRows.length === 0 ? (
        <div className="text-center text-muted text-sm py-10">No suggestions.</div>
      ) : (
        <div className="space-y-1.5">
          {dqRows.map((r) => (
            <div key={r.suggestionId} className="border border-line rounded-lg px-3 py-2.5">
              <div className="flex items-start gap-3">
                {canEdit && status === "PENDING" && (
                  <input type="checkbox" checked={checked.has(r.suggestionId)} onChange={() => toggle(r.suggestionId)} className="mt-1 w-3.5 h-3.5 accent-brand-purple" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link href={assetHref(r.assetType, r.assetId, r.schemaId)} className="text-[12px] font-semibold text-brand-deep hover:text-brand-purple hover:underline">
                      {r.entityName ? `${r.entityName}.${r.assetName}` : r.assetName}
                    </Link>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-gray-100"}`}>{r.status}</span>
                    {r.provenance === "LLM" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">AI</span>}
                  </div>
                  <p className="text-[12px] text-ink-soft mt-1">{r.ruleName} · {r.dimensionCode} · {r.ruleTemplateCode ?? "CUSTOM_SQL"}</p>
                </div>
                {canEdit && r.status === "PENDING" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => acceptDq(r.suggestionId)} className="text-[11px] font-semibold text-emerald-700 hover:underline">{e.accept}</button>
                    <button onClick={() => discardDq(r.suggestionId)} className="text-[11px] font-medium text-red-600 hover:underline">{e.discard}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
