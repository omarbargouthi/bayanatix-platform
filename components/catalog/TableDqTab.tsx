"use client";

import { useState, useEffect, useCallback } from "react";
import type { DqRule, DqResult, DqSample } from "@/lib/queries/dq";
import { DQ_TEMPLATES } from "@/lib/dq-templates";
import { AssetPicker, type SelectedAsset } from "@/components/dq/AssetPicker";

// ── Colour palette shared across all charts ───────────────────────────────────

const DIM_COLORS = [
  "#6058A0", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899",
];

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#EF4444",
  WARNING:  "#F59E0B",
  INFO:     "#3B82F6",
};

const STATUS_COLORS: Record<string, string> = {
  PASSED:  "bg-emerald-100 text-emerald-700",
  FAILED:  "bg-red-100 text-red-700",
  ERROR:   "bg-gray-200 text-gray-600",
  WARNING: "bg-amber-100 text-amber-700",
};

const SEVERITY_RING: Record<string, string> = {
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

// ── Pure-SVG charts ───────────────────────────────────────────────────────────

/** Chart 1 — horizontal bar: rule count per DQ dimension */
function ChartRulesPerDimension({ rules }: { rules: DqRule[] }) {
  const byDim: Record<string, number> = {};
  for (const r of rules) {
    const key = r.dimensionName ?? r.dimensionCode ?? "Other";
    byDim[key] = (byDim[key] ?? 0) + 1;
  }
  const entries = Object.entries(byDim).sort((a, b) => b[1] - a[1]);
  const maxVal  = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return <EmptyChart label="No rules defined yet" />;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([dim, count], i) => (
        <div key={dim} className="flex items-center gap-3">
          <div className="w-28 text-[11px] text-ink-soft truncate text-right shrink-0">{dim}</div>
          <div className="flex-1 h-6 bg-canvas-soft rounded-md overflow-hidden relative">
            <div
              className="h-full rounded-md transition-all duration-500"
              style={{
                width: `${(count / maxVal) * 100}%`,
                background: DIM_COLORS[i % DIM_COLORS.length],
              }}
            />
          </div>
          <div className="w-6 text-[12px] font-bold text-ink tabular-nums shrink-0">{count}</div>
        </div>
      ))}
    </div>
  );
}

/** Chart 2 — horizontal bar: rule count by severity/priority */
function ChartRulesBySeverity({ rules }: { rules: DqRule[] }) {
  const bySev: Record<string, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const r of rules) {
    const k = r.severityLevelCode ?? "INFO";
    bySev[k] = (bySev[k] ?? 0) + 1;
  }
  const total  = rules.length || 1;
  const order  = ["CRITICAL", "WARNING", "INFO"];

  if (rules.length === 0) return <EmptyChart label="No rules defined yet" />;

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden w-full">
        {order.map((sev) => {
          const pct = (bySev[sev] ?? 0) / total * 100;
          if (pct === 0) return null;
          return (
            <div
              key={sev}
              className="h-full transition-all duration-500 flex items-center justify-center text-white text-[10px] font-bold"
              style={{ width: `${pct}%`, background: SEV_COLORS[sev] }}
              title={`${sev}: ${bySev[sev]} rule(s)`}
            >
              {pct > 12 ? `${Math.round(pct)}%` : ""}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        {order.map((sev) => (
          <div key={sev} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: SEV_COLORS[sev] }} />
            <span className="text-[11px] text-muted">{sev} ({bySev[sev] ?? 0})</span>
          </div>
        ))}
      </div>
      {/* Detail rows */}
      <div className="space-y-2 mt-1">
        {order.map((sev) => {
          const count = bySev[sev] ?? 0;
          const pct   = (count / total) * 100;
          return (
            <div key={sev} className="flex items-center gap-3">
              <div className="w-20 text-[11px] text-ink-soft text-right shrink-0">{sev}</div>
              <div className="flex-1 h-5 bg-canvas-soft rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, background: SEV_COLORS[sev] }}
                />
              </div>
              <div className="w-10 text-[11px] font-bold tabular-nums text-right">{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Chart 3 — pie chart: aggregated DQ score % per dimension */
function ChartDqScorePerDimension({ rules }: { rules: DqRule[] }) {
  const scoredByDim: Record<string, number[]> = {};
  for (const r of rules) {
    if (r.lastScore == null || r.lastStatusCode === "ERROR") continue;
    const key = r.dimensionName ?? r.dimensionCode ?? "Other";
    if (!scoredByDim[key]) scoredByDim[key] = [];
    scoredByDim[key].push(Number(r.lastScore));
  }

  const entries = Object.entries(scoredByDim).map(([dim, scores], i) => ({
    dim,
    score: scores.reduce((a, b) => a + b, 0) / scores.length,
    color: DIM_COLORS[i % DIM_COLORS.length],
  }));

  if (entries.length === 0) return <EmptyChart label="Run rules to see dimension scores" />;

  // Build pie segments
  const size  = 140;
  const cx    = size / 2;
  const cy    = size / 2;
  const r     = 56;
  const inner = 32;
  const total = entries.reduce((s, e) => s + e.score, 0);
  let cumAngle = -Math.PI / 2;

  function polarToXY(angle: number, radius: number) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  const slices = entries.map((e) => {
    const angle = (e.score / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;
    const large = angle > Math.PI ? 1 : 0;
    const s = polarToXY(startAngle, r);
    const ef = polarToXY(endAngle, r);
    const si = polarToXY(startAngle, inner);
    const ei = polarToXY(endAngle, inner);
    const d = `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${ef.x} ${ef.y} L ${ei.x} ${ei.y} A ${inner} ${inner} 0 ${large} 0 ${si.x} ${si.y} Z`;
    const midAngle = startAngle + angle / 2;
    const labelPos = polarToXY(midAngle, r + 10);
    return { ...e, d, labelPos, angle };
  });

  const overallAvg = entries.reduce((s, e) => s + e.score, 0) / entries.length;

  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0 relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((sl) => (
            <path key={sl.dim} d={sl.d} fill={sl.color} stroke="white" strokeWidth="1.5">
              <title>{sl.dim}: {sl.score.toFixed(1)}%</title>
            </path>
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" className="text-[10px]" fontSize="11" fontWeight="800" fill="#1a1a2e">
            {Math.round(overallAvg)}%
          </text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7" fill="#94a3b8">avg score</text>
        </svg>
      </div>
      <div className="flex-1 space-y-1.5 min-w-0">
        {entries.map((e) => (
          <div key={e.dim} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
            <div className="text-[11px] text-ink-soft truncate flex-1">{e.dim}</div>
            <div className="text-[11px] font-bold tabular-nums" style={{ color: e.color }}>
              {e.score.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chart 4 — stacked horizontal bars: PASSED/FAILED/WARNING per dimension (threshold results only) */
function ChartResultsByDimension({ rules }: { rules: DqRule[] }) {
  // Only count successfully-executed rules (threshold outcomes)
  const byDim: Record<string, { PASSED: number; FAILED: number; WARNING: number; NONE: number }> = {};
  for (const r of rules) {
    const key = r.dimensionName ?? r.dimensionCode ?? "Other";
    if (!byDim[key]) byDim[key] = { PASSED: 0, FAILED: 0, WARNING: 0, NONE: 0 };
    const s = r.lastStatusCode;
    if (s === "PASSED" || s === "FAILED" || s === "WARNING") byDim[key][s]++;
    else if (s !== "ERROR") byDim[key].NONE++; // never-run
  }

  const entries = Object.entries(byDim);
  if (entries.length === 0) return <EmptyChart label="No rules to display" />;

  const statusConfig = [
    { key: "PASSED",  color: "#10B981", label: "Above threshold" },
    { key: "WARNING", color: "#F59E0B", label: "Near threshold"  },
    { key: "FAILED",  color: "#EF4444", label: "Below threshold" },
    { key: "NONE",    color: "#E2E8F0", label: "Not run"         },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        {statusConfig.filter((s) => s.key !== "NONE").map((s) => (
          <div key={s.key} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-[10px] text-muted">{s.label}</span>
          </div>
        ))}
      </div>
      {entries.map(([dim, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
        return (
          <div key={dim} className="flex items-center gap-3">
            <div className="w-24 text-[11px] text-ink-soft truncate text-right shrink-0">{dim}</div>
            <div className="flex-1 h-6 rounded-md overflow-hidden flex">
              {statusConfig.map((s) => {
                const cnt = counts[s.key as keyof typeof counts] ?? 0;
                const pct = (cnt / total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={s.key}
                    className="h-full transition-all duration-500 flex items-center justify-center"
                    style={{ width: `${pct}%`, background: s.color }}
                    title={`${s.label}: ${cnt}`}
                  >
                    {pct > 15 && (
                      <span className="text-[9px] font-bold text-white">{cnt}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="w-6 text-[11px] text-muted tabular-nums shrink-0">{total}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Overall DQ score card with trend indicator */
function OverallScoreCard({ rules }: { rules: DqRule[] }) {
  const scoredRules = rules.filter((r) => r.lastScore != null && r.lastStatusCode !== "ERROR");
  const prevScoredRules = rules.filter((r) => r.previousScore != null && r.lastStatusCode !== "ERROR");

  if (scoredRules.length === 0) {
    return (
      <div className="card p-5 flex flex-col items-center justify-center text-center min-h-[160px]">
        <div className="text-3xl font-extrabold text-muted mb-1">—</div>
        <div className="text-[11px] text-muted uppercase tracking-wider">No runs yet</div>
        <div className="text-xs text-muted mt-2">Run rules to calculate DQ score</div>
      </div>
    );
  }

  const current  = scoredRules.reduce((s, r) => s + Number(r.lastScore!), 0) / scoredRules.length;
  const previous = prevScoredRules.length > 0
    ? prevScoredRules.reduce((s, r) => s + Number(r.previousScore!), 0) / prevScoredRules.length
    : null;
  const delta = previous != null ? current - previous : null;

  const scoreColor = current >= 90 ? "text-emerald-600" : current >= 70 ? "text-amber-600" : "text-red-600";
  const ringColor  = current >= 90 ? "#10B981" : current >= 70 ? "#F59E0B" : "#EF4444";

  // SVG donut
  const size  = 110;
  const rOuter = 44;
  const circ  = 2 * Math.PI * rOuter;
  const offset = circ * (1 - current / 100);

  return (
    <div className="card p-5 flex flex-col items-center text-center">
      <div className="text-[11px] text-muted uppercase tracking-wider font-semibold mb-3">Overall DQ Score</div>
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={rOuter} fill="none" stroke="#E2E8F0" strokeWidth="10" />
          <circle
            cx={size/2} cy={size/2} r={rOuter} fill="none"
            stroke={ringColor} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-extrabold ${scoreColor}`}>{Math.round(current)}%</span>
        </div>
      </div>

      {/* Delta indicator */}
      {delta != null ? (
        <div className={`mt-2 flex items-center gap-1 text-[12px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          <span className="text-base">{delta >= 0 ? "▲" : "▼"}</span>
          <span>{Math.abs(delta).toFixed(1)}% vs prev run</span>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-muted">First run baseline</div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 w-full text-center">
        <div className="bg-emerald-50 rounded-md py-1.5">
          <div className="text-sm font-bold text-emerald-600">{scoredRules.filter((r) => r.lastStatusCode === "PASSED").length}</div>
          <div className="text-[9px] text-muted uppercase">Pass</div>
        </div>
        <div className="bg-amber-50 rounded-md py-1.5">
          <div className="text-sm font-bold text-amber-600">{scoredRules.filter((r) => r.lastStatusCode === "WARNING").length}</div>
          <div className="text-[9px] text-muted uppercase">Warn</div>
        </div>
        <div className="bg-red-50 rounded-md py-1.5">
          <div className="text-sm font-bold text-red-600">{scoredRules.filter((r) => r.lastStatusCode === "FAILED" || r.lastStatusCode === "ERROR").length}</div>
          <div className="text-[9px] text-muted uppercase">Fail</div>
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-20 text-sm text-muted">{label}</div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h4 className="font-bold text-sm text-ink">{title}</h4>
        {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
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
          <h3 className="font-bold text-ink">Failing Records</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && <div className="text-sm text-muted text-center py-8">Loading…</div>}
          {!loading && samples.length === 0 && (
            <div className="text-sm text-muted text-center py-8">
              No value samples were captured for this run.
            </div>
          )}
          {!loading && samples.length > 0 && (
            <>
              {/* Failing records first */}
              <div>
                <div className="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>Failing Records ({invalid.length})</span>
                  <span className="text-[10px] font-normal text-muted">— values that did not meet the DQ rule condition</span>
                </div>
                {invalid.length === 0 ? (
                  <div className="text-xs text-muted bg-canvas-soft rounded-md px-3 py-2">No failing records captured</div>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {invalid.map((s) => (
                      <div key={s.sampleId} className="flex justify-between bg-red-50 border border-red-100 rounded px-3 py-1.5">
                        <span className="font-mono text-[12px] text-red-800">{s.sampleValue}</span>
                        <span className="text-[11px] text-muted">×{s.sampleCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Valid samples as collapsible reference */}
              {valid.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                    Sample Valid Values ({valid.length})
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {valid.map((s) => (
                      <div key={s.sampleId} className="flex justify-between bg-emerald-50 border border-emerald-100 rounded px-3 py-1.5">
                        <span className="font-mono text-[12px] text-emerald-800">{s.sampleValue}</span>
                        <span className="text-[11px] text-muted">×{s.sampleCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add rule mini-form ────────────────────────────────────────────────────────

function AddRulePanel({ entityId, entityName, onClose, onSaved }: { entityId: number; entityName: string; onClose: () => void; onSaved: () => void }) {
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
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([{
    assetType: "DATA_ENTITIES",
    assetId: entityId,
    assetName: entityName,
    path: entityName,
    breadcrumb: [entityName],
  }]);
  const [showPicker, setShowPicker] = useState(false);

  const assetKind: "table" | "column" | null =
    selectedAssets.length > 0
      ? (selectedAssets[0].assetType === "DATA_ENTITIES" ? "table" : "column")
      : null;

  const applicableTemplates = DQ_TEMPLATES.filter(
    (t) => !assetKind || t.assetType === assetKind || t.assetType === "any"
  );

  const template = applicableTemplates.find((t) => t.code === ruleTemplateCode) ?? applicableTemplates[0];

  async function save() {
    if (!ruleName.trim()) { setError("Rule name is required"); return; }
    if (selectedAssets.length === 0) { setError("Select at least one asset"); return; }
    setSaving(true); setError("");
    try {
      const results = await Promise.all(
        selectedAssets.map((asset) =>
          fetch("/api/dq/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ruleName, dimensionCode,
              assetTypeCode: asset.assetType,
              assetId: asset.assetId,
              ruleTemplateCode,
              ruleConfig: Object.fromEntries(Object.entries(ruleConfig).map(([k, v]) => [k, isNaN(Number(v)) ? v : Number(v)])),
              ruleDefinitionText: "", severityLevelCode,
              thresholdWarn: thresholdWarn ? Number(thresholdWarn) : null,
              thresholdFail: thresholdFail ? Number(thresholdFail) : null,
              scheduleCron: null, notifyOwners, openIssueOnFail,
            }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error("Some rules failed to save");
      onSaved();
    } catch { setError("Failed to create rule(s)"); } finally { setSaving(false); }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-[560px] border border-line">
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
          {/* Asset targeting */}
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-2">
              Target Assets
              {selectedAssets.length > 1 && (
                <span className="ml-2 font-normal text-brand-purple">— will create {selectedAssets.length} rules</span>
              )}
            </label>
            {selectedAssets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedAssets.map((a) => (
                  <div key={`${a.assetType}-${a.assetId}`} className="flex items-center gap-1.5 bg-canvas-soft border border-line rounded pl-2 pr-1 py-0.5 text-[11px]">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${a.assetType === "DATA_ENTITIES" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {a.assetType === "DATA_ENTITIES" ? "TABLE" : "COL"}
                    </span>
                    {a.breadcrumb.length > 1 && (
                      <span className="text-muted text-[10px]">{a.breadcrumb.slice(0, -1).join(" › ")} › </span>
                    )}
                    <span className="font-semibold text-ink">{a.assetName}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAssets((prev) => prev.filter((s) => !(s.assetType === a.assetType && s.assetId === a.assetId)))}
                      className="ml-0.5 text-muted hover:text-red-500 leading-none"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="btn btn-sm text-[11px] border-brand-purple/40 text-brand-purple hover:bg-brand-purple/5"
            >
              {selectedAssets.length > 0 ? "Change / Add Columns" : "Select Target Assets…"}
            </button>
          </div>

          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <label className="block text-[11px] font-semibold text-muted">Template</label>
              {assetKind && (
                <span className="text-[10px] text-muted">{assetKind}-level rules only</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {applicableTemplates.map((t) => (
                <button key={t.code} type="button"
                  onClick={() => { setRuleTemplateCode(t.code); setRuleConfig({}); }}
                  className={`text-left px-2.5 py-2 rounded-lg border text-[11px] transition-colors ${ruleTemplateCode === t.code ? "border-brand-purple bg-brand-purple/5 text-brand-purple" : "border-line hover:border-brand-purple/40 text-ink-soft"}`}
                >
                  <div className="font-semibold">{t.label}</div>
                </button>
              ))}
            </div>
          </div>
          {template && template.configFields.length > 0 && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-canvas-soft rounded-lg border border-line">
              {template.configFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[11px] text-muted mb-1">{f.label}</label>
                  <input className="input w-full text-sm" type={f.type === "number" ? "number" : "text"}
                    value={ruleConfig[f.key] ?? ""} placeholder={String(f.default ?? "")}
                    onChange={(e) => setRuleConfig((prev) => ({ ...prev, [f.key]: e.target.value }))} />
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
            {saving ? "Saving…" : selectedAssets.length > 1 ? `Add ${selectedAssets.length} Rules` : "Add Rule"}
          </button>
        </div>
      </div>
    </div>

    {showPicker && (
      <AssetPicker
        selected={selectedAssets}
        onChange={(assets) => {
          setSelectedAssets(assets);
          // Auto-switch template if type changed
          const kind = assets.length > 0
            ? (assets[0].assetType === "DATA_ENTITIES" ? "table" : "column")
            : null;
          const valid = DQ_TEMPLATES.find(
            (t) => t.code === ruleTemplateCode && (!kind || t.assetType === kind || t.assetType === "any")
          );
          if (!valid) {
            const fallback = DQ_TEMPLATES.find((t) => !kind || t.assetType === kind || t.assetType === "any");
            if (fallback) { setRuleTemplateCode(fallback.code); setRuleConfig({}); }
          }
        }}
        preFilterEntityId={entityId}
        preFilterEntityName={entityName}
        defaultMode="column"
        onClose={() => setShowPicker(false)}
      />
    )}
    </>
  );
}

// ── Score gauge (mini, for rule rows) ────────────────────────────────────────

function MiniGauge({ value, size = 36 }: { value: number; size?: number }) {
  const r    = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / 100);
  const color  = value >= 90 ? "#10B981" : value >= 70 ? "#F59E0B" : "#EF4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E2E8F0" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TableDqTab({ entityId, entityName, canEdit }: { entityId: number; entityName: string; canEdit: boolean }) {
  const [rules, setRules] = useState<DqRule[]>([]);
  const [latestResults, setLatestResults] = useState<Record<number, DqResult>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [samplesResultId, setSamplesResultId] = useState<number | null>(null);
  const [runErrors, setRunErrors] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tableRules: DqRule[] = await fetch(`/api/dq/rules?assetTypeCode=DATA_ENTITIES&assetId=${entityId}`).then((r) => r.json());
      setRules(tableRules);

      // Fetch latest result per rule (for Samples button)
      const resultMap: Record<number, DqResult> = {};
      await Promise.all(
        tableRules.slice(0, 20).map(async (r) => {
          const res = await fetch(`/api/dq/rules/${r.ruleId}`);
          if (!res.ok) return;
          const { results } = await res.json();
          if (results?.length > 0) resultMap[r.ruleId] = results[0];
        })
      );
      setLatestResults(resultMap);
    } finally { setLoading(false); }
  }, [entityId]);

  useEffect(() => { load(); }, [load]);

  async function runAll() {
    setRunningAll(true);
    try {
      await fetch("/api/dq/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetTypeCode: "DATA_ENTITIES", assetId: entityId }) });
      await load();
    } finally { setRunningAll(false); }
  }

  async function runOne(ruleId: number) {
    setRunningId(ruleId);
    setRunErrors((prev) => { const n = { ...prev }; delete n[ruleId]; return n; });
    try {
      const res = await fetch("/api/dq/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const result = await res.json();
      if (result.statusCode === "ERROR" && result.message) {
        setRunErrors((prev) => ({ ...prev, [ruleId]: result.message }));
      }
      await load();
    } catch {
      setRunErrors((prev) => ({ ...prev, [ruleId]: "Failed to connect to run service" }));
    } finally { setRunningId(null); }
  }

  // Split ERROR rules from threshold-result rules
  const thresholdRules = rules.filter((r) => r.lastStatusCode !== "ERROR");
  const errorRules     = rules.filter((r) => r.lastStatusCode === "ERROR");

  // Group threshold-result rules by dimension
  const byDimension: Record<string, DqRule[]> = {};
  for (const r of thresholdRules) {
    const key = r.dimensionName ?? r.dimensionCode ?? "Other";
    if (!byDimension[key]) byDimension[key] = [];
    byDimension[key].push(r);
  }

  const passingCount = thresholdRules.filter((r) => r.lastStatusCode === "PASSED").length;
  const failingCount = thresholdRules.filter((r) => r.lastStatusCode === "FAILED").length;
  const warnCount    = thresholdRules.filter((r) => r.lastStatusCode === "WARNING").length;

  return (
    <div className="space-y-5">

      {/* ── Row 0: Overall score + action bar ───────────────────────────── */}
      <div className="grid grid-cols-[200px_1fr] gap-5">
        <OverallScoreCard rules={rules} />

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-ink">DQ Rules — {entityName}</h3>
              <p className="text-[11px] text-muted mt-0.5">
                {rules.length} rule{rules.length !== 1 ? "s" : ""} across {Object.keys(byDimension).length} dimension{Object.keys(byDimension).length !== 1 ? "s" : ""}
                {errorRules.length > 0 && <span className="text-amber-600 ml-1">· {errorRules.length} execution error{errorRules.length !== 1 ? "s" : ""}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {rules.length > 0 && (
                <button onClick={runAll} disabled={runningAll} className="btn btn-sm text-xs">
                  {runningAll ? "Running…" : "▶ Run All"}
                </button>
              )}
              {canEdit && (
                <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm text-xs">+ Add Rule</button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([["Passing", passingCount, "text-emerald-600", "bg-emerald-50"], ["Warnings", warnCount, "text-amber-600", "bg-amber-50"], ["Failing", failingCount, "text-red-600", "bg-red-50"]] as const).map(([label, val, clr, bg]) => (
              <div key={label} className={`rounded-lg ${bg} px-3 py-3 text-center`}>
                <div className={`text-2xl font-extrabold ${clr}`}>{val}</div>
                <div className="text-[10px] text-muted mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 1: Chart 1 + Chart 2 ────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 gap-5">
          <ChartCard
            title="Rules per DQ Dimension"
            subtitle="Number of DQ checks defined for each quality dimension"
          >
            <ChartRulesPerDimension rules={rules} />
          </ChartCard>

          <ChartCard
            title="Rules by Priority / Severity"
            subtitle="Distribution of rules by criticality level"
          >
            <ChartRulesBySeverity rules={rules} />
          </ChartCard>
        </div>
      )}

      {/* ── Row 2: Chart 3 + Chart 4 ────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 gap-5">
          <ChartCard
            title="Aggregated DQ Score % per Dimension"
            subtitle="Average pass rate across all rules in each dimension"
          >
            <ChartDqScorePerDimension rules={rules} />
          </ChartCard>

          <ChartCard
            title="DQ Check Results by Dimension"
            subtitle="Latest run outcome for each dimension — pass / warn / fail"
          >
            <ChartResultsByDimension rules={rules} />
          </ChartCard>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="card py-12 text-center text-muted text-sm">Loading DQ data…</div>
      )}

      {/* ── No rules empty state ─────────────────────────────────────────── */}
      {!loading && rules.length === 0 && (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="font-semibold text-ink mb-1">No DQ Rules Defined</h3>
          <p className="text-sm text-muted max-w-sm mx-auto mb-4">
            Add data quality rules to validate completeness, validity, uniqueness, and more for this table.
          </p>
          {canEdit && (
            <button onClick={() => setShowAdd(true)} className="btn btn-primary btn-sm">+ Add First Rule</button>
          )}
        </div>
      )}

      {/* ── Rules list grouped by dimension (threshold results only) ──────── */}
      {!loading && rules.length > 0 && Object.entries(byDimension).map(([dim, dimRules]) => (
        <div key={dim} className="card overflow-hidden">
          <div className="px-5 py-3 bg-canvas-soft border-b border-line flex items-center gap-3">
            <h4 className="font-bold text-sm text-ink">{dim}</h4>
            <span className="text-xs text-muted">{dimRules.length} rule{dimRules.length !== 1 ? "s" : ""}</span>
            {(() => {
              const scored = dimRules.filter((r) => r.lastScore != null && r.lastStatusCode !== "ERROR");
              if (scored.length === 0) return null;
              const avg = scored.reduce((s, r) => s + Number(r.lastScore!), 0) / scored.length;
              return (
                <span className={`ml-auto text-sm font-bold ${avg >= 90 ? "text-emerald-600" : avg >= 70 ? "text-amber-600" : "text-red-600"}`}>
                  {avg.toFixed(1)}% avg
                </span>
              );
            })()}
          </div>
          <div className="divide-y divide-line-soft">
            {dimRules.map((rule) => {
              const latest = latestResults[rule.ruleId];
              const score  = rule.lastScore != null ? Number(rule.lastScore) : null;
              const prev   = rule.previousScore != null ? Number(rule.previousScore) : null;
              const delta  = score != null && prev != null ? score - prev : null;
              const status = rule.lastStatusCode;
              const runErr = runErrors[rule.ruleId];
              // Threshold label
              const thresholdLabel =
                status === "PASSED"  ? { text: "Above threshold", cls: "bg-emerald-100 text-emerald-700" } :
                status === "FAILED"  ? { text: "Below threshold", cls: "bg-red-100 text-red-700" } :
                status === "WARNING" ? { text: "Near threshold",  cls: "bg-amber-100 text-amber-700" } :
                null;
              return (
                <div key={rule.ruleId} className="flex flex-col hover:bg-canvas-soft transition-colors">
                  <div className="px-5 py-3.5 flex items-center gap-4">
                    {/* Mini gauge */}
                    <div className="shrink-0 w-9 h-9 relative">
                      {score != null ? (
                        <>
                          <MiniGauge value={Math.round(score)} size={36} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[8px] font-bold text-ink">{Math.round(score)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="w-9 h-9 rounded-full border-2 border-line flex items-center justify-center">
                          <span className="text-[8px] text-muted">—</span>
                        </div>
                      )}
                    </div>

                    {/* Rule info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-ink">{rule.ruleName}</span>
                        {rule.ruleTemplateCode && (
                          <span className="text-[10px] font-mono bg-canvas-soft px-1.5 py-0.5 rounded border border-line text-muted">{rule.ruleTemplateCode}</span>
                        )}
                        {rule.severityLevelCode && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEVERITY_RING[rule.severityLevelCode] ?? ""}`}>{rule.severityLevelCode}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                        {rule.thresholdFail != null && <span>Fail &lt; {rule.thresholdFail}%</span>}
                        {rule.thresholdWarn != null && <span>Warn &lt; {rule.thresholdWarn}%</span>}
                        {latest?.executionTimestamp && (
                          <span>Last: {new Date(latest.executionTimestamp).toLocaleDateString()}</span>
                        )}
                        {latest?.recordsScanned != null && <span>Scanned: {Number(latest.recordsScanned).toLocaleString()}</span>}
                        {latest?.recordsFailed != null && latest.recordsFailed > 0 && (
                          <span className="text-red-600">{Number(latest.recordsFailed).toLocaleString()} failed records</span>
                        )}
                      </div>
                    </div>

                    {/* Delta */}
                    {delta != null && (
                      <div className={`text-[11px] font-semibold shrink-0 ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}%
                      </div>
                    )}

                    {/* Threshold result + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {thresholdLabel ? (
                        <Badge text={thresholdLabel.text} className={thresholdLabel.cls} />
                      ) : (
                        <span className="text-[11px] text-muted italic">Not yet run</span>
                      )}
                      {latest && (status === "FAILED" || status === "WARNING") && (
                        <button
                          onClick={() => setSamplesResultId(latest.resultId)}
                          className="btn btn-sm text-[11px] px-2 py-1 text-red-600 border-red-200 hover:bg-red-50"
                          title="View records that failed this check"
                        >
                          Failing Records
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

                  {/* Inline run error */}
                  {runErr && (
                    <div className="mx-5 mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-[11px] text-amber-800">
                      <span className="shrink-0 font-bold">Execution error:</span>
                      <span className="flex-1">{runErr}</span>
                      <button
                        onClick={() => setRunErrors((prev) => { const n = { ...prev }; delete n[rule.ruleId]; return n; })}
                        className="shrink-0 text-amber-500 hover:text-amber-700"
                      >×</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Execution error rules (separate section) ─────────────────────── */}
      {!loading && errorRules.length > 0 && (
        <div className="card overflow-hidden border-amber-200">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
            <span className="text-sm font-bold text-amber-700">Execution Errors ({errorRules.length})</span>
            <span className="text-[11px] text-amber-600 flex-1">
              These rules failed to execute. Review their configuration in the DQ Dashboard.
            </span>
          </div>
          <div className="divide-y divide-line-soft">
            {errorRules.map((rule) => {
              const runErr = runErrors[rule.ruleId];
              return (
                <div key={rule.ruleId} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-ink">{rule.ruleName}</div>
                    {rule.ruleTemplateCode && (
                      <span className="text-[10px] font-mono bg-canvas-soft px-1.5 py-0.5 rounded border border-line text-muted">{rule.ruleTemplateCode}</span>
                    )}
                    {runErr && <div className="text-[11px] text-amber-700 mt-1 truncate max-w-lg">{runErr}</div>}
                  </div>
                  <Badge text="Execution Error" className="bg-amber-100 text-amber-700 shrink-0" />
                  <button
                    onClick={() => runOne(rule.ruleId)}
                    disabled={runningId === rule.ruleId}
                    className="btn btn-sm text-[11px] px-2 py-1 shrink-0"
                  >
                    {runningId === rule.ruleId ? "…" : "▶ Retry"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && <AddRulePanel entityId={entityId} entityName={entityName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {samplesResultId != null && <SamplesPanel resultId={samplesResultId} onClose={() => setSamplesResultId(null)} />}
    </div>
  );
}
