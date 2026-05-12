"use client";

import { useState, useEffect, useCallback } from "react";
import type { DqRule, DqResult, DqSample } from "@/lib/queries/dq";
import { DQ_TEMPLATES } from "@/lib/dq-templates";

// ── Color helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PASSED:  "bg-emerald-100 text-emerald-700",
  FAILED:  "bg-red-100 text-red-700",
  ERROR:   "bg-gray-200 text-gray-600",
  WARNING: "bg-amber-100 text-amber-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-50 border-red-200",
  WARNING:  "text-amber-600 bg-amber-50 border-amber-200",
  INFO:     "text-blue-600 bg-blue-50 border-blue-200",
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${className}`}>
      {text}
    </span>
  );
}

function ScoreGauge({ value, size = 64 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  const color = value >= 90 ? "#22c55e" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── Samples panel ─────────────────────────────────────────────────────────────

function SamplesPanel({ resultId, onClose }: { resultId: number; onClose: () => void }) {
  const [samples, setSamples] = useState<DqSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dq/results/${resultId}/samples`)
      .then((r) => r.json())
      .then((d) => { setSamples(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [resultId]);

  const valid   = samples.filter((s) => s.isValid);
  const invalid = samples.filter((s) => !s.isValid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[580px] border border-line max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-ink">Value Samples</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <div className="text-sm text-muted text-center py-8">Loading samples…</div>}
          {!loading && samples.length === 0 && (
            <div className="text-sm text-muted text-center py-8">
              No value samples captured for this run. Samples are recorded when the rule captures specific values (e.g., VALUE_IN_LIST, NOT_NULL).
            </div>
          )}
          {!loading && samples.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider mb-3">
                  Valid Values ({valid.length})
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto nice-scroll">
                  {valid.length === 0 && <div className="text-xs text-muted">None captured</div>}
                  {valid.map((s) => (
                    <div key={s.sampleId} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
                      <span className="font-mono text-[12px] text-ink">{s.sampleValue}</span>
                      <span className="text-[11px] text-muted ml-3">×{s.sampleCount}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-3">
                  Invalid Values ({invalid.length})
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto nice-scroll">
                  {invalid.length === 0 && <div className="text-xs text-muted">None captured</div>}
                  {invalid.map((s) => (
                    <div key={s.sampleId} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-md px-3 py-2">
                      <span className="font-mono text-[12px] text-ink">{s.sampleValue}</span>
                      <span className="text-[11px] text-muted ml-3">×{s.sampleCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Rule mini-form ────────────────────────────────────────────────────────

function AddRulePanel({
  entityId,
  onClose,
  onSaved,
}: {
  entityId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ruleName, setRuleName] = useState("");
  const [dimensionCode, setDimensionCode] = useState("COMP");
  const [ruleTemplateCode, setRuleTemplateCode] = useState("ROW_COUNT_THRESHOLD");
  const [ruleConfig, setRuleConfig] = useState<Record<string, string>>({});
  const [severityLevelCode, setSeverity] = useState("WARNING");
  const [thresholdWarn, setWarn] = useState("95");
  const [thresholdFail, setFail] = useState("80");
  const [notifyOwners, setNotify] = useState(true);
  const [openIssueOnFail, setOpenIssue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const template = DQ_TEMPLATES.find((t) => t.code === ruleTemplateCode);

  async function save() {
    if (!ruleName.trim()) { setError("Rule name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/dq/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleName,
          dimensionCode,
          assetTypeCode: "DATA_ENTITIES",
          assetId: entityId,
          ruleTemplateCode,
          ruleConfig: Object.fromEntries(Object.entries(ruleConfig).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])),
          ruleDefinitionText: "",
          severityLevelCode,
          thresholdWarn: thresholdWarn ? Number(thresholdWarn) : null,
          thresholdFail: thresholdFail ? Number(thresholdFail) : null,
          scheduleCron: null,
          notifyOwners,
          openIssueOnFail,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved();
    } catch {
      setError("Failed to create rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-[580px] border border-line">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-bold text-ink">Add DQ Rule to This Table</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1">Rule Name *</label>
              <input className="input w-full text-sm" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. Row Count Check" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1">Severity</label>
              <select className="input w-full text-sm" value={severityLevelCode} onChange={(e) => setSeverity(e.target.value)}>
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted mb-2">Template</label>
            <div className="grid grid-cols-3 gap-2">
              {DQ_TEMPLATES.filter((t) => t.assetType === "table" || t.assetType === "any").map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => { setRuleTemplateCode(t.code); setRuleConfig({}); }}
                  className={`text-left px-2.5 py-2 rounded-lg border text-[11px] transition-colors ${
                    ruleTemplateCode === t.code
                      ? "border-brand-purple bg-brand-purple/5 text-brand-purple"
                      : "border-line hover:border-brand-purple/40 text-ink-soft"
                  }`}
                >
                  <div className="font-semibold">{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          {template && "configFields" in template && template.configFields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-canvas-soft rounded-lg border border-line">
              {template.configFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[11px] text-muted mb-1">{f.label}</label>
                  <input
                    className="input w-full text-sm"
                    type={f.type === "number" ? "number" : "text"}
                    value={ruleConfig[f.key] ?? ""}
                    onChange={(e) => setRuleConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={String(f.default ?? "")}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted mb-1">Warn below (%)</label>
              <input className="input w-full text-sm" type="number" value={thresholdWarn} onChange={(e) => setWarn(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1">Fail below (%)</label>
              <input className="input w-full text-sm" type="number" value={thresholdFail} onChange={(e) => setFail(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg bg-canvas-soft border border-line p-3.5 space-y-2.5">
            <label className="flex items-center gap-3 cursor-pointer text-sm">
              <input type="checkbox" checked={notifyOwners} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 accent-brand-purple" />
              Notify asset owners on failure
            </label>
            <label className="flex items-center gap-3 cursor-pointer text-sm">
              <input type="checkbox" checked={openIssueOnFail} onChange={(e) => setOpenIssue(e.target.checked)} className="w-4 h-4 accent-brand-purple" />
              Auto-open data fix request on failure
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? "Saving…" : "Add Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TableDqTab({
  entityId,
  entityName,
  canEdit,
}: {
  entityId: number;
  entityName: string;
  canEdit: boolean;
}) {
  const [rules, setRules] = useState<DqRule[]>([]);
  const [latestResults, setLatestResults] = useState<Record<number, DqResult>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [samplesResultId, setSamplesResultId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch table-level rules
      const [tableRules, colRules] = await Promise.all([
        fetch(`/api/dq/rules?assetTypeCode=DATA_ENTITIES&assetId=${entityId}`).then((r) => r.json()),
        fetch(`/api/dq/rules?assetTypeCode=DATA_ATTRIBUTES`).then((r) => r.json()),
      ]);
      // colRules will include all column rules — we can't filter by entity on the API easily,
      // so just show table-level rules here. Column rules show in the column tab.
      setRules(tableRules as DqRule[]);

      // Fetch latest result per rule
      const resultMap: Record<number, DqResult> = {};
      await Promise.all(
        (tableRules as DqRule[]).slice(0, 20).map(async (r: DqRule) => {
          const res = await fetch(`/api/dq/rules/${r.ruleId}`);
          if (!res.ok) return;
          const { results } = await res.json();
          if (results?.length > 0) resultMap[r.ruleId] = results[0];
        })
      );
      setLatestResults(resultMap);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  async function runAll() {
    setRunningAll(true);
    try {
      await fetch("/api/dq/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetTypeCode: "DATA_ENTITIES", assetId: entityId }),
      });
      await load();
    } finally {
      setRunningAll(false);
    }
  }

  async function runOne(ruleId: number) {
    setRunningId(ruleId);
    try {
      await fetch("/api/dq/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      await load();
    } finally {
      setRunningId(null);
    }
  }

  // Compute overall DQ score for this table
  const scoredRules  = rules.filter((r) => r.lastScore != null);
  const overallScore = scoredRules.length > 0
    ? scoredRules.reduce((s, r) => s + Number(r.lastScore!), 0) / scoredRules.length
    : null;

  const passingCount = rules.filter((r) => r.lastStatusCode === "PASSED").length;
  const failingCount = rules.filter((r) => r.lastStatusCode === "FAILED" || r.lastStatusCode === "ERROR").length;
  const warnCount    = rules.filter((r) => r.lastStatusCode === "WARNING").length;

  // Group by dimension
  const byDimension: Record<string, DqRule[]> = {};
  for (const r of rules) {
    const key = r.dimensionName ?? r.dimensionCode ?? "Other";
    if (!byDimension[key]) byDimension[key] = [];
    byDimension[key].push(r);
  }

  return (
    <div className="space-y-5">
      {/* Score summary row */}
      <div className="grid grid-cols-[200px_1fr] gap-5">
        <div className="card p-5 flex flex-col items-center justify-center text-center">
          {overallScore != null ? (
            <>
              <div className="relative">
                <ScoreGauge value={Math.round(overallScore)} size={80} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-extrabold text-ink">{Math.round(overallScore)}%</span>
                </div>
              </div>
              <div className="text-[11px] text-muted mt-2 uppercase tracking-wider">Overall DQ Score</div>
              <div className="text-xs text-muted mt-1">{entityName}</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-extrabold text-muted">—</div>
              <div className="text-[11px] text-muted mt-2 uppercase tracking-wider">No runs yet</div>
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink">DQ Rules for {entityName}</h3>
            <div className="flex items-center gap-2">
              {rules.length > 0 && (
                <button onClick={runAll} disabled={runningAll} className="btn btn-sm text-xs">
                  {runningAll ? "Running all…" : "▶ Run All"}
                </button>
              )}
              {canEdit && (
                <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm text-xs">+ Add Rule</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              ["Total Rules", rules.length, "text-ink"],
              ["Passing", passingCount, "text-emerald-600"],
              ["Failing", failingCount, "text-red-600"],
              ["Warnings", warnCount, "text-amber-600"],
            ].map(([label, val, cls]) => (
              <div key={label as string} className="bg-canvas-soft rounded-lg px-3 py-2.5 text-center">
                <div className={`text-xl font-extrabold ${cls}`}>{val}</div>
                <div className="text-[10px] text-muted mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rules list */}
      {loading && <div className="card py-12 text-center text-muted text-sm">Loading rules…</div>}

      {!loading && rules.length === 0 && (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="font-semibold text-ink mb-1">No DQ Rules Defined</h3>
          <p className="text-sm text-muted max-w-sm mx-auto mb-4">
            Define data quality rules to validate completeness, validity, uniqueness, and more for this table.
          </p>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm">+ Add First Rule</button>
          )}
        </div>
      )}

      {!loading && Object.entries(byDimension).map(([dim, dimRules]) => (
        <div key={dim} className="card overflow-hidden">
          <div className="px-5 py-3 bg-canvas-soft border-b border-line flex items-center gap-3">
            <h4 className="font-bold text-sm text-ink">{dim}</h4>
            <span className="text-xs text-muted">{dimRules.length} rule{dimRules.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-line-soft">
            {dimRules.map((rule) => {
              const latest = latestResults[rule.ruleId];
              const score  = rule.lastScore != null ? Number(rule.lastScore) : null;
              const status = rule.lastStatusCode;
              return (
                <div key={rule.ruleId} className="px-5 py-3.5 flex items-center gap-4 hover:bg-canvas-soft transition-colors">
                  {/* Score gauge mini */}
                  <div className="shrink-0 w-10 h-10 relative">
                    {score != null ? (
                      <>
                        <ScoreGauge value={Math.round(score)} size={40} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[9px] font-bold text-ink">{Math.round(score)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="w-10 h-10 rounded-full border-2 border-line flex items-center justify-center">
                        <span className="text-[9px] text-muted">—</span>
                      </div>
                    )}
                  </div>

                  {/* Rule info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-ink">{rule.ruleName}</span>
                      {rule.ruleTemplateCode && (
                        <span className="text-[10px] font-mono bg-canvas-soft px-1.5 py-0.5 rounded border border-line text-muted">
                          {rule.ruleTemplateCode}
                        </span>
                      )}
                      {rule.severityLevelCode && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[rule.severityLevelCode] ?? ""}`}>
                          {rule.severityLevelCode}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                      {rule.thresholdFail != null && <span>Fail &lt; {rule.thresholdFail}%</span>}
                      {rule.thresholdWarn != null && <span>Warn &lt; {rule.thresholdWarn}%</span>}
                      {rule.scheduleCron && <span className="font-mono">{rule.scheduleCron}</span>}
                      {rule.notifyOwners && <span>🔔 notify</span>}
                      {rule.openIssueOnFail && <span>🎫 auto-issue</span>}
                      {latest?.executionTimestamp && (
                        <span>Last run: {new Date(latest.executionTimestamp).toLocaleDateString()}</span>
                      )}
                    </div>
                    {latest && (
                      <div className="text-[11px] text-muted mt-1 flex items-center gap-3">
                        {latest.recordsScanned != null && <span>Scanned: {Number(latest.recordsScanned).toLocaleString()}</span>}
                        {latest.recordsFailed != null && <span className="text-red-600">Failed: {Number(latest.recordsFailed).toLocaleString()}</span>}
                        {latest.message && <span className="truncate max-w-[240px]">{latest.message}</span>}
                      </div>
                    )}
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {status ? (
                      <Badge text={status} className={STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"} />
                    ) : (
                      <span className="text-[11px] text-muted">Never run</span>
                    )}
                    {latest && (
                      <button
                        onClick={() => setSamplesResultId(latest.resultId)}
                        className="btn btn-sm text-[11px] px-2 py-1"
                        title="View value samples"
                      >
                        Samples
                      </button>
                    )}
                    <button
                      onClick={() => runOne(rule.ruleId)}
                      disabled={runningId === rule.ruleId}
                      className="btn btn-sm text-[11px] px-2 py-1"
                    >
                      {runningId === rule.ruleId ? "…" : "▶ Run"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Modals */}
      {showAdd && (
        <AddRulePanel
          entityId={entityId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {samplesResultId != null && (
        <SamplesPanel resultId={samplesResultId} onClose={() => setSamplesResultId(null)} />
      )}
    </div>
  );
}
