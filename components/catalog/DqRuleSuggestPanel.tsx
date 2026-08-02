"use client";

import { useState, useEffect } from "react";
import { useLang } from "@/lib/lang-context";

type Suggestion = {
  suggestionId: number;
  assetType: "DATA_ENTITIES" | "DATA_ATTRIBUTES";
  assetId: number;
  assetName: string;
  entityName: string | null;
  dimensionCode: string | null;
  ruleName: string | null;
  ruleTemplateCode: string | null;
  ruleLogicType: string | null;
  thresholdJson: Record<string, unknown> | string | null;
  severity: string;
  provenance: string;
  evidence: Record<string, unknown> | string | null;
  status: string;
};

function asObj(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
  return v as Record<string, unknown>;
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
  WARNING: "bg-amber-50 text-amber-700 border-amber-200",
  INFO: "bg-blue-50 text-blue-700 border-blue-200",
};

// "Suggest Rules" panel inside the DQ rule builder (spec §3.1/§5.3): lists Tier 1
// (deterministic) + Tier 2 (LLM, BUSINESS columns only) rule drafts for a table's
// columns as pre-filled drafts. Add / Add-with-edits / Dismiss per draft.
export function DqRuleSuggestPanel({
  entityId, entityName, onClose, onSaved,
}: {
  entityId: number;
  entityName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const e = t.enrichment;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSeverity, setEditSeverity] = useState("WARNING");
  const [degraded, setDegraded] = useState(false);
  const [tier2Skipped, setTier2Skipped] = useState(false);

  async function run() {
    setLoading(true); setError(null);
    try {
      const colsRes = await fetch(`/api/catalog/browse?type=columns&entityId=${entityId}`);
      const cols: { id: number }[] = await colsRes.json();
      const colIds = cols.map((c) => c.id);

      await fetch(`/api/assets/DATA_ENTITIES/${entityId}/dq/suggest`, { method: "POST" }).catch(() => {});

      if (colIds.length > 0) {
        const jobRes = await fetch("/api/enrichment/dq/jobs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_type: "DATA_ATTRIBUTES", asset_ids: colIds }),
        });
        const jobData = await jobRes.json();
        if (jobRes.ok) {
          // Short-lived synchronous poll — Tier 1 is fast and Tier 2 only fires for
          // BUSINESS columns, so a single-table run finishes in well under this window.
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const jr = await fetch(`/api/enrichment/dq/jobs/${jobData.jobId}`);
            const j = await jr.json();
            if (j.status !== "RUNNING") {
              setDegraded((j.logs ?? []).some((l: { message: string }) => l.message.includes("stale/absent")));
              setTier2Skipped((j.logs ?? []).some((l: { message: string }) => l.message.includes("Tier 2 (LLM) skipped")));
              break;
            }
          }
        }
      }

      const queueRes = await fetch(`/api/enrichment/dq?entity_id=${entityId}&status=`);
      const queueData = await queueRes.json();
      setSuggestions((queueData.data ?? []).filter((s: Suggestion) => s.status === "PENDING" || s.status === "DUPLICATE"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDraft(s: Suggestion, overrides?: { ruleName?: string; severityLevelCode?: string }) {
    setBusyId(s.suggestionId);
    try {
      const res = await fetch(`/api/enrichment/dq/${s.suggestionId}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides ? { overrides } : {}),
      });
      if (res.ok) {
        setSuggestions((prev) => prev.filter((x) => x.suggestionId !== s.suggestionId));
        setEditingId(null);
        onSaved();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function dismissDraft(s: Suggestion) {
    setBusyId(s.suggestionId);
    try {
      await fetch(`/api/enrichment/dq/${s.suggestionId}/discard`, { method: "POST" });
      setSuggestions((prev) => prev.filter((x) => x.suggestionId !== s.suggestionId));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(s: Suggestion) {
    setEditingId(s.suggestionId);
    setEditName(s.ruleName ?? "");
    setEditSeverity(s.severity);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-brand-deep">{e.ruleDraftsTitle}</h2>
            <p className="text-[12px] text-muted mt-0.5">{entityName}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto nice-scroll px-5 py-4 space-y-3">
          {degraded && (
            <div className="text-[12px] bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-3 py-2">{e.degradedProfileWarning}</div>
          )}
          {tier2Skipped && (
            <div className="text-[12px] bg-blue-50 text-blue-800 border border-blue-200 rounded-md px-3 py-2">{e.tier2UnavailableWarning}</div>
          )}
          {error && <div className="text-[12px] bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {loading && <div className="text-center text-muted text-sm py-10">{e.suggestingRules}</div>}
          {!loading && suggestions.length === 0 && !error && (
            <div className="text-center text-muted text-sm py-10">No rule suggestions — the table may already be well covered.</div>
          )}

          {suggestions.map((s) => {
            const threshold = asObj(s.thresholdJson);
            const evidence = asObj(s.evidence);
            const isDuplicate = s.status === "DUPLICATE";
            return (
              <div key={s.suggestionId} className={`border rounded-lg p-3 ${isDuplicate ? "border-line bg-canvas-soft opacity-70" : "border-line"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-semibold text-ink">{s.ruleName}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${SEVERITY_STYLE[s.severity] ?? ""}`}>{s.severity}</span>
                      {s.provenance === "LLM" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">AI</span>}
                      {isDuplicate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{e.duplicateLabel}</span>}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">{s.dimensionCode} · {s.ruleTemplateCode ?? "CUSTOM_SQL"}</div>
                    {Object.keys(threshold).length > 0 && (
                      <div className="text-[11px] text-ink-soft mt-1 font-mono">
                        {String(threshold.metric ?? "")} {String(threshold.operator ?? "")} {JSON.stringify(threshold.value)}
                      </div>
                    )}
                    {Object.keys(evidence).length > 0 && (
                      <div className="text-[10px] text-muted mt-1">
                        <span className="font-semibold">{e.evidenceLabel}:</span> {Object.entries(evidence).map(([k, v]) => `${k}=${v}`).join(", ")}
                      </div>
                    )}
                  </div>
                </div>

                {editingId === s.suggestionId ? (
                  <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-line-soft">
                    <input value={editName} onChange={(ev) => setEditName(ev.target.value)}
                      className="flex-1 text-[12px] border border-line rounded px-2 py-1" />
                    <select value={editSeverity} onChange={(ev) => setEditSeverity(ev.target.value)}
                      className="text-[12px] border border-line rounded px-2 py-1">
                      <option value="INFO">INFO</option>
                      <option value="WARNING">WARNING</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                    <button
                      onClick={() => addDraft(s, { ruleName: editName, severityLevelCode: editSeverity })}
                      disabled={busyId === s.suggestionId}
                      className="text-[11px] font-semibold text-white bg-brand-purple rounded px-2.5 py-1 disabled:opacity-40"
                    >
                      {e.addDraftWithEdits}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-[11px] text-muted hover:text-ink">✕</button>
                  </div>
                ) : (
                  !isDuplicate && (
                    <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-line-soft">
                      <button onClick={() => addDraft(s)} disabled={busyId === s.suggestionId} className="text-[11px] font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                        {e.addDraft}
                      </button>
                      <button onClick={() => startEdit(s)} className="text-[11px] font-medium text-muted hover:text-ink hover:underline">
                        {e.addDraftWithEdits}
                      </button>
                      <button onClick={() => dismissDraft(s)} disabled={busyId === s.suggestionId} className="text-[11px] font-medium text-red-600 hover:underline">
                        {e.dismissDraft}
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
