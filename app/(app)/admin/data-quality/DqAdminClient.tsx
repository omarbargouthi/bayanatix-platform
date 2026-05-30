"use client";

import { useState, useCallback } from "react";
import type { DqDimension, DqRule, DqResult, DqDashboardStats } from "@/lib/queries/dq";
import { DQ_TEMPLATES, buildRuleConfig } from "@/lib/dq-templates";
import { AssetPicker, type SelectedAsset } from "@/components/dq/AssetPicker";
import { RefIntegrityPicker } from "@/components/dq/RefIntegrityPicker";
import { useLang } from "@/lib/lang-context";

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  WARNING:  "bg-amber-100 text-amber-700",
  INFO:     "bg-blue-100 text-blue-700",
};

const STATUS_COLORS: Record<string, string> = {
  PASSED:  "bg-emerald-100 text-emerald-700",
  FAILED:  "bg-red-100 text-red-700",
  ERROR:   "bg-gray-200 text-gray-600",
  WARNING: "bg-amber-100 text-amber-700",
};

function Badge({ text, className }: { text: string; className: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${className}`}>{text}</span>;
}

// ── Micro sparkline bar chart ─────────────────────────────────────────────────

function TrendBar({ trend }: { trend: { date: string; passed: number; failed: number; avgScore: number | null }[] }) {
  const { t } = useLang();
  if (trend.length === 0) {
    return <div className="text-sm text-muted text-center py-8">{t.dq.noRunHistory}</div>;
  }
  const maxTotal = Math.max(...trend.map((t) => t.passed + t.failed), 1);
  return (
    <div className="flex items-end gap-1 h-28">
      {trend.map((t) => {
        const total = t.passed + t.failed;
        const passH = total > 0 ? Math.round((t.passed / maxTotal) * 112) : 0;
        const failH = total > 0 ? Math.round((t.failed / maxTotal) * 112) : 0;
        return (
          <div key={t.date} className="flex flex-col items-center gap-0.5 flex-1 group relative">
            <div className="flex flex-col-reverse w-full gap-0" title={`${t.date}: ${t.passed} passed, ${t.failed} failed`}>
              {failH > 0 && <div className="w-full bg-red-400 rounded-t" style={{ height: failH }} />}
              {passH > 0 && <div className="w-full bg-emerald-400 rounded-b" style={{ height: passH }} />}
              {total === 0 && <div className="w-full bg-line rounded" style={{ height: 4 }} />}
            </div>
            <div className="text-[9px] text-muted opacity-0 group-hover:opacity-100 absolute -bottom-4 whitespace-nowrap">
              {t.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "blue" }: { label: string; value: string | number; sub?: string; color?: "blue" | "green" | "red" | "purple" | "amber" }) {
  const colors = {
    blue:   "border-l-blue-400 bg-blue-50/50 text-blue-600",
    green:  "border-l-emerald-400 bg-emerald-50/50 text-emerald-600",
    red:    "border-l-red-400 bg-red-50/50 text-red-600",
    purple: "border-l-brand-purple bg-brand-purple/5 text-brand-purple",
    amber:  "border-l-amber-400 bg-amber-50/50 text-amber-600",
  }[color];
  const [bg, text] = colors.split(" ").reduce<[string, string]>(
    (acc, cls) => cls.startsWith("text-") ? [acc[0], cls] : [`${acc[0]} ${cls}`, acc[1]],
    ["", ""]
  );
  return (
    <div className={`card border-l-4 ${bg} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

// ── Rule form modal ───────────────────────────────────────────────────────────

type RuleFormData = {
  ruleName: string;
  dimensionCode: string;
  selectedAssets: SelectedAsset[];
  ruleTemplateCode: string;
  ruleConfig: Record<string, string>;
  ruleDefinitionText: string;
  severityLevelCode: string;
  thresholdWarn: string;
  thresholdFail: string;
  scheduleCron: string;
  notifyOwners: boolean;
  openIssueOnFail: boolean;
};

const DEFAULT_FORM: RuleFormData = {
  ruleName: "",
  dimensionCode: "COMP",
  selectedAssets: [],
  ruleTemplateCode: "ROW_COUNT_THRESHOLD",
  ruleConfig: {},
  ruleDefinitionText: "",
  severityLevelCode: "WARNING",
  thresholdWarn: "95",
  thresholdFail: "80",
  scheduleCron: "",
  notifyOwners: true,
  openIssueOnFail: false,
};

function RuleFormModal({
  dimensions,
  editRule,
  onClose,
  onSaved,
}: {
  dimensions: DqDimension[];
  editRule: DqRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const dq = t.dq;
  const [form, setForm] = useState<RuleFormData>(
    editRule
      ? {
          ruleName: editRule.ruleName,
          dimensionCode: editRule.dimensionCode ?? "COMP",
          selectedAssets: [{
            assetType: editRule.assetTypeCode as "DATA_ENTITIES" | "DATA_ATTRIBUTES",
            assetId: editRule.assetId,
            assetName: editRule.assetName ?? String(editRule.assetId),
            path: [editRule.sourceName, editRule.schemaName, editRule.assetTypeCode === "DATA_ATTRIBUTES" ? editRule.parentEntityName : null, editRule.assetName ?? String(editRule.assetId)].filter(Boolean).join(" › "),
            breadcrumb: [editRule.sourceName, editRule.schemaName, editRule.assetTypeCode === "DATA_ATTRIBUTES" ? editRule.parentEntityName : null, editRule.assetName ?? String(editRule.assetId)].filter(Boolean) as string[],
          }],
          ruleTemplateCode: editRule.ruleTemplateCode ?? "CUSTOM_SQL",
          ruleConfig: Object.fromEntries(Object.entries(editRule.ruleConfig).map(([k, v]) => [k, String(v)])),
          ruleDefinitionText: editRule.ruleDefinitionText,
          severityLevelCode: editRule.severityLevelCode ?? "WARNING",
          thresholdWarn: editRule.thresholdWarn != null ? String(editRule.thresholdWarn) : "",
          thresholdFail: editRule.thresholdFail != null ? String(editRule.thresholdFail) : "",
          scheduleCron: editRule.scheduleCron ?? "",
          notifyOwners: editRule.notifyOwners,
          openIssueOnFail: editRule.openIssueOnFail,
        }
      : DEFAULT_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Derive which templates apply based on the first selected asset's type
  const assetKind: "table" | "column" | null =
    form.selectedAssets.length > 0
      ? (form.selectedAssets[0].assetType === "DATA_ENTITIES" ? "table" : "column")
      : null;

  const applicableTemplates = DQ_TEMPLATES.filter(
    (t) => !assetKind || t.assetType === assetKind || t.assetType === "any"
  );

  const selectedTemplate = applicableTemplates.find((t) => t.code === form.ruleTemplateCode)
    ?? applicableTemplates[0];

  async function handleSave() {
    if (!form.ruleName.trim()) {
      setError("Rule name is required.");
      return;
    }
    if (form.selectedAssets.length === 0) {
      setError("Select at least one asset using the asset browser.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const base = {
        ruleName: form.ruleName,
        dimensionCode: form.dimensionCode || null,
        ruleTemplateCode: form.ruleTemplateCode !== "CUSTOM_SQL" ? form.ruleTemplateCode : null,
        ruleConfig: buildRuleConfig(form.ruleConfig, form.ruleTemplateCode),
        ruleDefinitionText: form.ruleDefinitionText || "",
        severityLevelCode: form.severityLevelCode,
        thresholdWarn: form.thresholdWarn ? Number(form.thresholdWarn) : null,
        thresholdFail: form.thresholdFail ? Number(form.thresholdFail) : null,
        scheduleCron: form.scheduleCron || null,
        notifyOwners: form.notifyOwners,
        openIssueOnFail: form.openIssueOnFail,
      };
      if (editRule) {
        const asset = form.selectedAssets[0];
        await fetch(`/api/dq/rules/${editRule.ruleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, assetTypeCode: asset.assetType, assetId: asset.assetId }),
        });
      } else {
        await Promise.all(
          form.selectedAssets.map((asset) =>
            fetch("/api/dq/rules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...base, assetTypeCode: asset.assetType, assetId: asset.assetId }),
            })
          )
        );
      }
      onSaved();
    } catch {
      setError("Failed to save rule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-[680px] border border-line">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-bold text-brand-deep">{editRule ? dq.editRuleTitle : dq.newRuleTitle}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</div>}

          {/* Name + Severity */}
          <div className="grid grid-cols-[1fr_160px] gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">{dq.ruleNameLabel}</label>
              <input className="input w-full" value={form.ruleName} onChange={(e) => setForm((f) => ({ ...f, ruleName: e.target.value }))} placeholder="e.g. Customer ID Not Null" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">{dq.severityLabel}</label>
              <select className="input w-full" value={form.severityLevelCode} onChange={(e) => setForm((f) => ({ ...f, severityLevelCode: e.target.value }))}>
                <option value="INFO">{dq.severityInfo}</option>
                <option value="WARNING">{dq.severityWarning}</option>
                <option value="CRITICAL">{dq.severityCritical}</option>
              </select>
            </div>
          </div>

          {/* Asset targeting */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">
                {dq.targetAssets}
                {!editRule && form.selectedAssets.length > 1 && (
                  <span className="ml-2 font-normal text-brand-purple">
                    — {dq.dqDimensionLabel} {form.selectedAssets.length} rules
                  </span>
                )}
              </label>

              {form.selectedAssets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5 p-2.5 bg-canvas-soft rounded-lg border border-line">
                  {form.selectedAssets.map((a) => (
                    <div
                      key={`${a.assetType}-${a.assetId}`}
                      className="flex items-center gap-1.5 bg-white border border-line rounded-md pl-2.5 pr-1.5 py-1 text-[11px]"
                    >
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${a.assetType === "DATA_ENTITIES" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {a.assetType === "DATA_ENTITIES" ? "TABLE" : "COL"}
                      </span>
                      {a.breadcrumb.length > 1 && (
                        <span className="text-muted text-[10px]">{a.breadcrumb.slice(0, -1).join(" › ")} › </span>
                      )}
                      <span className="font-semibold text-ink">{a.assetName}</span>
                      {!editRule && (
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({
                            ...f,
                            selectedAssets: f.selectedAssets.filter((s) => !(s.assetType === a.assetType && s.assetId === a.assetId)),
                          }))}
                          className="ml-0.5 text-muted hover:text-red-500 text-sm leading-none"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAssetPicker(true)}
                className="btn btn-sm border-brand-purple/40 text-brand-purple hover:bg-brand-purple/5"
              >
                {form.selectedAssets.length > 0
                  ? editRule ? dq.changeAsset : dq.changeAddAssets
                  : dq.browseAssets}
              </button>
            </div>

            <div className="w-52">
              <label className="block text-xs font-semibold text-muted mb-1">{dq.dqDimensionLabel}</label>
              <select className="input w-full" value={form.dimensionCode} onChange={(e) => setForm((f) => ({ ...f, dimensionCode: e.target.value }))}>
                {dimensions.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* Template picker */}
          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <label className="text-xs font-semibold text-muted">{dq.ruleTemplate}</label>
              {assetKind && (
                <span className="text-[10px] text-muted">
                  {applicableTemplates.length} {dq.rulesCount} · {assetKind}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {applicableTemplates.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ruleTemplateCode: t.code, ruleConfig: f.ruleTemplateCode === t.code ? f.ruleConfig : {} }))}
                  className={`text-left px-3 py-2.5 rounded-lg border text-[12px] transition-colors ${
                    form.ruleTemplateCode === t.code
                      ? "border-brand-purple bg-brand-purple/5 text-brand-purple"
                      : "border-line hover:border-brand-purple/40 text-ink-soft"
                  }`}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-[10px] text-muted mt-0.5 line-clamp-2">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Template config fields */}
          {selectedTemplate && selectedTemplate.configFields.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">Template Configuration</label>
              <div className="grid grid-cols-2 gap-3 p-3 bg-canvas-soft rounded-lg border border-line">
                {selectedTemplate.code === "REFERENTIAL_CHECK" ? (
                  <RefIntegrityPicker
                    refTable={form.ruleConfig["ref_table"] ?? ""}
                    refColumn={form.ruleConfig["ref_column"] ?? ""}
                    onChange={(t, c) => setForm((f) => ({ ...f, ruleConfig: { ...f.ruleConfig, ref_table: t, ref_column: c } }))}
                  />
                ) : (
                  selectedTemplate.configFields.map((f) => (
                    <div key={f.key} className={f.key === "allowed_values" ? "col-span-2" : ""}>
                      <label className="block text-[11px] text-muted mb-1">{f.label}</label>
                      {f.key === "allowed_values" ? (
                        <>
                          <textarea
                            className="input w-full text-sm h-16 resize-none font-mono"
                            value={form.ruleConfig[f.key] ?? ""}
                            onChange={(e) => setForm((prev) => ({ ...prev, ruleConfig: { ...prev.ruleConfig, [f.key]: e.target.value } }))}
                            placeholder="active, inactive, pending"
                          />
                          <p className="text-[10px] text-muted mt-1">Comma-separated list of allowed values (e.g. active, inactive, pending)</p>
                        </>
                      ) : (
                        <input
                          className="input w-full text-sm"
                          type={f.type === "number" ? "number" : "text"}
                          value={form.ruleConfig[f.key] ?? ""}
                          onChange={(e) => setForm((prev) => ({ ...prev, ruleConfig: { ...prev.ruleConfig, [f.key]: e.target.value } }))}
                          placeholder={String(f.default ?? "")}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Custom SQL */}
          {form.ruleTemplateCode === "CUSTOM_SQL" && (
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">{dq.customSql}</label>
              <p className="text-[11px] text-muted mb-2">{dq.customSqlDesc}</p>
              <textarea
                className="input w-full font-mono text-xs h-28 resize-none"
                value={form.ruleDefinitionText}
                onChange={(e) => setForm((f) => ({ ...f, ruleDefinitionText: e.target.value }))}
                placeholder="SELECT COUNT(*) AS total_rows, COUNT(*) FILTER (WHERE col IS NULL) AS failed_rows FROM schema.table"
              />
            </div>
          )}

          {/* Thresholds */}
          <div>
            <label className="block text-xs font-semibold text-muted mb-2">{dq.scoreThresholds}</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-muted mb-1">{dq.warnBelow}</label>
                <input className="input w-full" type="number" min="0" max="100" value={form.thresholdWarn} onChange={(e) => setForm((f) => ({ ...f, thresholdWarn: e.target.value }))} placeholder="95" />
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">{dq.failBelow}</label>
                <input className="input w-full" type="number" min="0" max="100" value={form.thresholdFail} onChange={(e) => setForm((f) => ({ ...f, thresholdFail: e.target.value }))} placeholder="80" />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">{dq.schedCron}</label>
            <input className="input w-full font-mono text-sm" value={form.scheduleCron} onChange={(e) => setForm((f) => ({ ...f, scheduleCron: e.target.value }))} placeholder="0 6 * * * (daily at 6am)" />
            <div className="flex gap-3 mt-2">
              {["0 6 * * *", "0 * * * *", "*/30 * * * *"].map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, scheduleCron: c }))} className="text-[11px] text-brand-purple hover:underline font-mono">{c}</button>
              ))}
            </div>
          </div>

          {/* Notification + issue config */}
          <div className="rounded-lg bg-canvas-soft border border-line p-4 space-y-3">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{dq.actionsOnFail}</div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.notifyOwners} onChange={(e) => setForm((f) => ({ ...f, notifyOwners: e.target.checked }))} className="w-4 h-4 accent-brand-purple" />
              <span className="text-sm text-ink">{dq.notifyOwners}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.openIssueOnFail} onChange={(e) => setForm((f) => ({ ...f, openIssueOnFail: e.target.checked }))} className="w-4 h-4 accent-brand-purple" />
              <span className="text-sm text-ink">{dq.autoOpenIssue}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="btn btn-sm">{t.common.cancel}</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving
              ? t.common.saving
              : editRule
                ? dq.saveChangesBtn
                : form.selectedAssets.length > 1
                  ? `${dq.createRuleBtn} (${form.selectedAssets.length})`
                  : dq.createRuleBtn}
          </button>
        </div>
      </div>
    </div>

    {showAssetPicker && (
      <AssetPicker
        selected={form.selectedAssets}
        onChange={(assets) => {
          setForm((f) => {
            const kind = assets.length > 0
              ? (assets[0].assetType === "DATA_ENTITIES" ? "table" : "column")
              : null;
            const valid = DQ_TEMPLATES.find(
              (t) => t.code === f.ruleTemplateCode && (!kind || t.assetType === kind || t.assetType === "any")
            );
            const fallback = DQ_TEMPLATES.find((t) => !kind || t.assetType === kind || t.assetType === "any");
            return {
              ...f,
              selectedAssets: assets,
              ruleTemplateCode: valid ? f.ruleTemplateCode : (fallback?.code ?? f.ruleTemplateCode),
              ruleConfig: f.ruleConfig,
            };
          });
        }}
        onClose={() => setShowAssetPicker(false)}
      />
    )}
    </>
  );
}

// ── Run result detail modal ───────────────────────────────────────────────────

function RunDetailModal({ result, onClose }: { result: DqResult; onClose: () => void }) {
  const { t } = useLang();
  const dq = t.dq;
  const [samples, setSamples] = useState<{ sampleId: number; sampleValue: string; isValid: boolean; sampleCount: number }[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(true);

  useState(() => {
    fetch(`/api/dq/results/${result.resultId}/samples`)
      .then((r) => r.json())
      .then((d) => { setSamples(d); setLoadingSamples(false); })
      .catch(() => setLoadingSamples(false));
  });

  const validSamples   = samples.filter((s) => s.isValid);
  const invalidSamples = samples.filter((s) => !s.isValid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[640px] border border-line max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div>
            <h2 className="font-bold text-brand-deep">{result.ruleName}</h2>
            <div className="text-xs text-muted">{new Date(result.executionTimestamp).toLocaleString()}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-4 gap-3">
            {[
              ["Status",  result.statusCode ?? "—"],
              ["Score",   result.score != null ? `${Number(result.score).toFixed(1)}%` : "—"],
              ["Scanned", result.recordsScanned?.toLocaleString() ?? "—"],
              ["Failed",  result.recordsFailed?.toLocaleString() ?? "—"],
            ].map(([label, val]) => (
              <div key={label} className="bg-canvas-soft rounded-lg px-3 py-2.5 text-center">
                <div className="font-bold text-ink text-base">{val}</div>
                <div className="text-[10px] text-muted">{label}</div>
              </div>
            ))}
          </div>

          {result.message && (
            <div className="bg-canvas-soft rounded-lg px-4 py-3 text-sm text-ink-soft border border-line">
              {result.message}
            </div>
          )}

          {/* Samples */}
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{dq.valueSamples}</div>
            {loadingSamples && <div className="text-sm text-muted">{dq.loadingSamples}</div>}
            {!loadingSamples && samples.length === 0 && (
              <div className="text-sm text-muted">{dq.noSamples}</div>
            )}
            {!loadingSamples && samples.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-emerald-600 mb-2">{dq.validValues} ({validSamples.length})</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {validSamples.map((s) => (
                      <div key={s.sampleId} className="flex items-center justify-between bg-emerald-50 rounded px-3 py-1.5 text-xs">
                        <span className="font-mono text-ink">{s.sampleValue}</span>
                        <span className="text-muted">×{s.sampleCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-red-600 mb-2">{dq.invalidValues} ({invalidSamples.length})</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {invalidSamples.map((s) => (
                      <div key={s.sampleId} className="flex items-center justify-between bg-red-50 rounded px-3 py-1.5 text-xs">
                        <span className="font-mono text-ink">{s.sampleValue}</span>
                        <span className="text-muted">×{s.sampleCount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main client ───────────────────────────────────────────────────────────────

type Tab = "dashboard" | "rules" | "runs";

export function DqAdminClient({
  dimensions,
  initialRules,
  stats,
  trend,
  recentRuns,
  userRole,
}: {
  dimensions: DqDimension[];
  initialRules: DqRule[];
  stats: DqDashboardStats;
  trend: { date: string; passed: number; failed: number; avgScore: number | null }[];
  recentRuns: DqResult[];
  userRole: string;
}) {
  const { t } = useLang();
  const dq = t.dq;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<DqRule | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<number | null>(null);
  const [runResults, setRunResults] = useState<Record<number, { status: string; score: number | null }>>({});
  const [detailResult, setDetailResult] = useState<DqResult | null>(null);
  const [runs, setRuns] = useState(recentRuns);
  const [filterDimension, setFilterDimension] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const canEdit = userRole === "ADMIN" || userRole === "STEWARD";

  const loadRules = useCallback(async () => {
    const r = await fetch("/api/dq/rules");
    setRules(await r.json());
  }, []);

  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/dq/rules");
    const newRules: DqRule[] = await r.json();
    setRules(newRules);
    // fetch recent results
    const recent: DqResult[] = [];
    for (const rule of newRules.slice(0, 10)) {
      const res = await fetch(`/api/dq/rules/${rule.ruleId}`);
      if (!res.ok) continue;
      const { results } = await res.json();
      recent.push(...results.slice(0, 3));
    }
    setRuns(recent.sort((a, b) => new Date(b.executionTimestamp).getTime() - new Date(a.executionTimestamp).getTime()));
  }, []);

  async function runRule(ruleId: number) {
    setRunningRuleId(ruleId);
    try {
      const res = await fetch("/api/dq/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId }),
      });
      const result = await res.json();
      setRunResults((prev) => ({ ...prev, [ruleId]: { status: result.statusCode, score: result.score } }));
      await loadRules();
    } catch {
      setRunResults((prev) => ({ ...prev, [ruleId]: { status: "ERROR", score: null } }));
    } finally {
      setRunningRuleId(null);
    }
  }

  async function toggleActive(rule: DqRule) {
    await fetch(`/api/dq/rules/${rule.ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    loadRules();
  }

  async function deleteRule(ruleId: number) {
    if (!confirm("Delete this rule? All run history will be lost.")) return;
    await fetch(`/api/dq/rules/${ruleId}`, { method: "DELETE" });
    loadRules();
  }

  const filteredRules = rules.filter((r) => {
    if (filterDimension && r.dimensionCode !== filterDimension) return false;
    if (filterStatus === "active" && !r.isActive) return false;
    if (filterStatus === "failing" && r.lastStatusCode !== "FAILED") return false;
    if (filterStatus === "passing" && r.lastStatusCode !== "PASSED") return false;
    return true;
  });

  return (
    <div>
      {/* Tab nav */}
      <div className="border-b border-line bg-white px-8">
        <nav className="flex items-center gap-0">
          {(["dashboard", "rules", "runs"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); if (tabKey === "runs") loadRuns(); }}
              className={`px-5 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                tab === tabKey
                  ? "text-brand-purple border-brand-purple"
                  : "text-ink-soft border-transparent hover:text-brand-deep hover:border-brand-purple/30"
              }`}
            >
              {tabKey === "dashboard" ? dq.tabDashboard : tabKey === "rules" ? dq.tabRules : dq.tabRuns}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && (
        <main className="px-8 py-7 pb-14">
          {/* Stats row */}
          <div className="grid grid-cols-6 gap-4 mb-7">
            <StatCard label={dq.totalRules}  value={stats.totalRules}   color="blue" />
            <StatCard label={dq.activeRules} value={stats.activeRules}  color="purple" />
            <StatCard label={dq.runsToday}   value={stats.runsToday}    color="blue" />
            <StatCard label={dq.passing}     value={stats.passingRules} color="green" />
            <StatCard label={dq.failing}     value={stats.failingRules} color="red" />
            <StatCard label={dq.avgScore}    value={stats.avgScore != null ? `${stats.avgScore.toFixed(1)}%` : "—"} color="purple" />
          </div>

          <div className="grid grid-cols-[1.6fr_1fr] gap-5 mb-5">
            {/* Trend chart */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-ink">{dq.runTrends}</h3>
                <div className="flex items-center gap-4 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> {dq.trendPassed}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> {dq.trendFailed}</span>
                </div>
              </div>
              <TrendBar trend={trend} />
            </div>

            {/* DQ by dimension */}
            <div className="card p-5">
              <h3 className="font-bold text-ink mb-4">{dq.rulesByDim}</h3>
              <div className="space-y-2">
                {dimensions.map((d) => {
                  const count = rules.filter((r) => r.dimensionCode === d.code).length;
                  const passing = rules.filter((r) => r.dimensionCode === d.code && r.lastStatusCode === "PASSED").length;
                  return (
                    <div key={d.code} className="flex items-center gap-3">
                      <div className="w-24 text-[11px] text-muted truncate">{d.name}</div>
                      <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-purple"
                          style={{ width: count > 0 ? `${(passing / count) * 100}%` : "0%" }}
                        />
                      </div>
                      <div className="text-[11px] text-muted w-12 text-right">{count} {dq.rulesCount}</div>
                    </div>
                  );
                })}
                {dimensions.every((d) => rules.filter((r) => r.dimensionCode === d.code).length === 0) && (
                  <p className="text-sm text-muted text-center py-4">{dq.noRulesYet}</p>
                )}
              </div>
            </div>
          </div>

          {/* Failing rules heatmap */}
          <div className="card p-5">
            <h3 className="font-bold text-ink mb-4">{dq.failingWarning}</h3>
            {rules.filter((r) => r.lastStatusCode === "FAILED" || r.lastStatusCode === "WARNING" || r.lastStatusCode === "ERROR").length === 0 ? (
              <div className="text-sm text-muted text-center py-6">{dq.allPassing}</div>
            ) : (
              <div className="space-y-2">
                {rules
                  .filter((r) => r.lastStatusCode === "FAILED" || r.lastStatusCode === "WARNING" || r.lastStatusCode === "ERROR")
                  .map((r) => (
                    <div key={r.ruleId} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-red-50/70 border border-red-100">
                      <Badge text={r.lastStatusCode ?? "—"} className={STATUS_COLORS[r.lastStatusCode ?? "ERROR"] ?? "bg-gray-100 text-gray-600"} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-ink">{r.ruleName}</div>
                        <div className="text-[11px] text-muted">
                          {r.assetTypeCode === "DATA_ENTITIES" ? "Table" : "Column"}
                          {r.assetTypeCode === "DATA_ATTRIBUTES" && r.parentEntityName
                            ? ` · ${r.parentEntityName} › ${r.assetName ?? r.assetId}`
                            : r.assetName
                              ? ` · ${r.assetName}`
                              : ` · #${r.assetId}`}
                          {r.dimensionName && ` · ${r.dimensionName}`}
                        </div>
                      </div>
                      {r.lastScore != null && (
                        <div className="text-sm font-bold text-red-600">{r.lastScore.toFixed(1)}%</div>
                      )}
                      <button onClick={() => runRule(r.ruleId)} disabled={runningRuleId === r.ruleId} className="btn btn-sm text-xs">
                        {runningRuleId === r.ruleId ? dq.running : dq.rerunBtn}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── Rule Library ── */}
      {tab === "rules" && (
        <main className="px-8 py-7 pb-14">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <select
                className="input text-sm"
                value={filterDimension}
                onChange={(e) => setFilterDimension(e.target.value)}
              >
                <option value="">{dq.allDimensions}</option>
                {dimensions.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
              <select
                className="input text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">{dq.allStatuses}</option>
                <option value="active">{dq.activeOnly}</option>
                <option value="passing">{dq.passingFilter}</option>
                <option value="failing">{dq.failingFilter}</option>
              </select>
              <span className="text-sm text-muted">{filteredRules.length} {dq.rulesCount}</span>
            </div>
            {canEdit && (
              <button onClick={() => { setEditRule(null); setShowForm(true); }} className="btn btn-primary btn-sm">
                {dq.newRule}
              </button>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[2fr_1fr_1fr_80px_80px_80px_90px_110px] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
              <div>{dq.colRule}</div>
              <div>{dq.colDimension}</div>
              <div>{dq.colAsset}</div>
              <div>{dq.colSeverity}</div>
              <div>{dq.colScore}</div>
              <div>{dq.colStatus}</div>
              <div>{dq.colSchedule}</div>
              <div>{dq.colActions}</div>
            </div>

            {filteredRules.length === 0 && (
              <div className="py-16 text-center text-muted text-sm">
                {dq.noRulesMatch}{" "}
                {canEdit && (
                  <button onClick={() => { setEditRule(null); setShowForm(true); }} className="text-brand-purple hover:underline">{dq.createFirstRule}</button>
                )}
              </div>
            )}

            {filteredRules.map((rule) => {
              const runStatus = runResults[rule.ruleId];
              const displayStatus = runStatus?.status ?? rule.lastStatusCode;
              const displayScore = runStatus?.score ?? rule.lastScore;
              return (
                <div key={rule.ruleId} className={`grid grid-cols-[2fr_1fr_1fr_80px_80px_80px_90px_110px] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft ${!rule.isActive ? "opacity-50" : ""}`}>
                  <div>
                    <div className="font-semibold text-ink leading-tight">{rule.ruleName}</div>
                    <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                      {rule.ruleTemplateCode && <span className="font-mono bg-canvas-soft px-1.5 rounded">{rule.ruleTemplateCode}</span>}
                      {rule.notifyOwners && <span title="Notify owners">🔔</span>}
                      {rule.openIssueOnFail && <span title="Auto-open issue">🎫</span>}
                    </div>
                  </div>
                  <div className="text-[12px] text-ink-soft">{rule.dimensionName ?? rule.dimensionCode ?? "—"}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${rule.assetTypeCode === "DATA_ENTITIES" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {rule.assetTypeCode === "DATA_ENTITIES" ? "TABLE" : "COL"}
                      </span>
                      <span className="text-[12px] font-semibold text-ink truncate">{rule.assetName ?? `#${rule.assetId}`}</span>
                    </div>
                    {(rule.sourceName || rule.schemaName || rule.parentEntityName) && (
                      <div className="text-[10px] text-muted truncate mt-0.5">
                        {[rule.sourceName, rule.schemaName, rule.assetTypeCode === "DATA_ATTRIBUTES" ? rule.parentEntityName : null].filter(Boolean).join(" › ")}
                      </div>
                    )}
                  </div>
                  <div>
                    {rule.severityLevelCode && (
                      <Badge text={rule.severityLevelCode} className={SEVERITY_COLORS[rule.severityLevelCode] ?? "bg-gray-100 text-gray-600"} />
                    )}
                  </div>
                  <div className="font-bold text-ink tabular-nums">
                    {displayScore != null ? `${Number(displayScore).toFixed(1)}%` : "—"}
                  </div>
                  <div>
                    {displayStatus ? (
                      <Badge text={displayStatus} className={STATUS_COLORS[displayStatus] ?? "bg-gray-100 text-gray-600"} />
                    ) : <span className="text-muted text-xs">{dq.neverRun}</span>}
                  </div>
                  <div className="text-[11px] font-mono text-muted truncate">{rule.scheduleCron || "—"}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => runRule(rule.ruleId)}
                      disabled={runningRuleId === rule.ruleId}
                      className="btn btn-sm text-[11px] px-2 py-1"
                      title="Run now"
                    >
                      {runningRuleId === rule.ruleId ? "…" : dq.runBtn}
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => { setEditRule(rule); setShowForm(true); }} className="btn btn-sm text-[11px] px-2 py-1" title="Edit">{dq.editBtn}</button>
                        <button onClick={() => toggleActive(rule)} className="btn btn-sm text-[11px] px-2 py-1 text-ink-soft" title={rule.isActive ? "Deactivate" : "Activate"}>
                          {rule.isActive ? dq.pauseBtn : dq.enableBtn}
                        </button>
                        <button onClick={() => deleteRule(rule.ruleId)} className="btn btn-sm text-[11px] px-2 py-1 text-red-600 hover:bg-red-50" title="Delete">{dq.delBtn}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ── Run History ── */}
      {tab === "runs" && (
        <main className="px-8 py-7 pb-14">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h3 className="font-bold">{dq.recentRuns}</h3>
              <button onClick={loadRuns} className="btn btn-sm text-xs">{dq.refreshBtn}</button>
            </div>
            <div className="grid grid-cols-[2fr_1fr_80px_80px_80px_80px_80px_80px] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
              <div>{dq.colRule}</div>
              <div>{dq.colTimestamp}</div>
              <div>{dq.colStatus}</div>
              <div>{dq.colScore}</div>
              <div>{dq.colScanned}</div>
              <div>{dq.colPassed}</div>
              <div>{dq.colFailed}</div>
              <div>{dq.colDetail}</div>
            </div>
            {runs.length === 0 && (
              <div className="py-16 text-center text-muted text-sm">
                {dq.noRunsYet}
              </div>
            )}
            {runs.map((r) => (
              <div key={r.resultId} className="grid grid-cols-[2fr_1fr_80px_80px_80px_80px_80px_80px] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft">
                <div>
                  <div className="font-semibold text-ink">{r.ruleName}</div>
                  {r.message && <div className="text-[11px] text-muted truncate max-w-xs">{r.message}</div>}
                </div>
                <div className="text-[11px] text-muted">{new Date(r.executionTimestamp).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div>
                <div>{r.statusCode && <Badge text={r.statusCode} className={STATUS_COLORS[r.statusCode] ?? "bg-gray-100 text-gray-600"} />}</div>
                <div className="font-bold tabular-nums">{r.score != null ? `${Number(r.score).toFixed(1)}%` : "—"}</div>
                <div className="tabular-nums text-muted">{r.recordsScanned?.toLocaleString() ?? "—"}</div>
                <div className="tabular-nums text-emerald-600">{r.recordsPassed?.toLocaleString() ?? "—"}</div>
                <div className="tabular-nums text-red-600">{r.recordsFailed?.toLocaleString() ?? "—"}</div>
                <div>
                  <button onClick={() => setDetailResult(r)} className="btn btn-sm text-[11px] px-2 py-1">{dq.detailBtn}</button>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Modals */}
      {showForm && (
        <RuleFormModal
          dimensions={dimensions}
          editRule={editRule}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadRules(); }}
        />
      )}
      {detailResult && <RunDetailModal result={detailResult} onClose={() => setDetailResult(null)} />}
    </div>
  );
}
