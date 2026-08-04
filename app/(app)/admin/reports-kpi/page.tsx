"use client";

import { useEffect, useState, useCallback } from "react";

type KpiDefinition = {
  kpiCode: string; reportCode: string; nameEn: string; nameAr: string | null;
  capabilityCode: string; metricKey: string | null; customSql: string | null;
  targetValue: number | null; direction: "UP" | "DOWN"; format: "PERCENT" | "NUMBER" | "DAYS";
  sortOrder: number; isActive: boolean;
};

type ExportAuditRow = {
  auditId: number; reportCode: string; exportedByName: string | null;
  filters: Record<string, unknown>; format: string; exportedAt: string;
};

const REPORT_LABELS: Record<string, string> = {
  R1_MCM: "Data Catalog / Metadata", R2_DQ: "Data Quality", R3_DC: "Data Classification",
  R4_DSI: "Data Sharing", R5_OD: "Open Data", R6_FOI: "FOI",
  R7_PDP: "Personal Data Protection", R8_DG_SUMMARY: "DG Executive Summary", R9_RETENTION: "Retention",
};

const BLANK_ADD = {
  kpiCode: "", reportCode: "R2_DQ", nameEn: "", nameAr: "", capabilityCode: "",
  customSql: "", targetValue: "", direction: "UP" as "UP" | "DOWN", format: "NUMBER" as "PERCENT" | "NUMBER" | "DAYS",
};

export default function ReportsKpiAdminPage() {
  const [kpis, setKpis] = useState<KpiDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ targetValue: "", isActive: true });
  const [saving, setSaving] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...BLANK_ADD });
  const [testResult, setTestResult] = useState<{ value: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [exports, setExports] = useState<ExportAuditRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, exportRes] = await Promise.all([
        fetch("/api/admin/reports-kpi"),
        fetch("/api/admin/reports-kpi/exports"),
      ]);
      if (kpiRes.ok) setKpis(await kpiRes.json());
      if (exportRes.ok) setExports(await exportRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(k: KpiDefinition) {
    setEditingCode(k.kpiCode);
    setEditForm({ targetValue: k.targetValue?.toString() ?? "", isActive: k.isActive });
  }

  async function saveEdit(kpiCode: string) {
    setSaving(true);
    try {
      await fetch(`/api/admin/reports-kpi/${kpiCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetValue: editForm.targetValue === "" ? null : Number(editForm.targetValue),
          isActive: editForm.isActive,
        }),
      });
      setEditingCode(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(k: KpiDefinition) {
    await fetch(`/api/admin/reports-kpi/${k.kpiCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !k.isActive }),
    });
    await load();
  }

  async function testSql() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/reports-kpi/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: addForm.customSql }),
      });
      setTestResult(await r.json());
    } finally {
      setTesting(false);
    }
  }

  async function saveCustomKpi() {
    setAddError(null);
    const r = await fetch("/api/admin/reports-kpi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...addForm,
        capabilityCode: addForm.capabilityCode || addForm.reportCode,
        targetValue: addForm.targetValue === "" ? null : Number(addForm.targetValue),
      }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setAddError(body.error ?? "Failed to create KPI");
      return;
    }
    setShowAdd(false);
    setAddForm({ ...BLANK_ADD });
    setTestResult(null);
    await load();
  }

  const grouped = kpis.reduce<Record<string, KpiDefinition[]>>((acc, k) => {
    (acc[k.reportCode] ??= []).push(k);
    return acc;
  }, {});

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-deep">Report KPI Admin</h1>
          <p className="text-xs text-muted mt-0.5">Edit targets, enable/disable KPIs, and add custom SQL-based KPIs (sandboxed, read-only).</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-sm px-3 py-2 rounded-lg bg-brand-purple text-white hover:bg-brand-violet"
        >
          {showAdd ? "Cancel" : "+ Add Custom KPI"}
        </button>
      </div>

      {showAdd && (
        <div className="card-padded space-y-3">
          <div className="text-sm font-semibold text-ink">New Custom KPI</div>
          <div className="grid grid-cols-2 gap-3">
            <input className="field-input" placeholder="KPI_CODE (e.g. DQ_CUSTOM_METRIC)" value={addForm.kpiCode}
              onChange={(e) => setAddForm({ ...addForm, kpiCode: e.target.value.toUpperCase() })} />
            <select className="field-input" value={addForm.reportCode} onChange={(e) => setAddForm({ ...addForm, reportCode: e.target.value })}>
              {Object.entries(REPORT_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <input className="field-input" placeholder="Name (English)" value={addForm.nameEn} onChange={(e) => setAddForm({ ...addForm, nameEn: e.target.value })} />
            <input className="field-input" placeholder="Name (Arabic, optional)" value={addForm.nameAr} onChange={(e) => setAddForm({ ...addForm, nameAr: e.target.value })} />
            <select className="field-input" value={addForm.direction} onChange={(e) => setAddForm({ ...addForm, direction: e.target.value as "UP" | "DOWN" })}>
              <option value="UP">Higher is better</option>
              <option value="DOWN">Lower is better</option>
            </select>
            <select className="field-input" value={addForm.format} onChange={(e) => setAddForm({ ...addForm, format: e.target.value as any })}>
              <option value="NUMBER">Number</option>
              <option value="PERCENT">Percent</option>
              <option value="DAYS">Days</option>
            </select>
            <input className="field-input" type="number" placeholder="Target (optional)" value={addForm.targetValue}
              onChange={(e) => setAddForm({ ...addForm, targetValue: e.target.value })} />
          </div>
          <textarea
            className="field-input font-mono text-xs" rows={4}
            placeholder="SELECT count(*) AS value FROM bayanat.data_sources"
            value={addForm.customSql}
            onChange={(e) => setAddForm({ ...addForm, customSql: e.target.value })}
          />
          <p className="text-xs text-muted">
            Must be a single SELECT statement returning a numeric <code>value</code> column. Runs read-only, 3s timeout, no filter substitution (global value only).
          </p>
          <div className="flex items-center gap-2">
            <button onClick={testSql} disabled={testing || !addForm.customSql} className="text-sm px-3 py-1.5 rounded-lg border border-line hover:bg-canvas disabled:opacity-50">
              {testing ? "Testing…" : "Test Query"}
            </button>
            {testResult && (
              testResult.error
                ? <span className="text-xs text-red-600">{testResult.error}</span>
                : <span className="text-xs text-emerald-600">Result: {testResult.value}</span>
            )}
          </div>
          {addError && <div className="text-xs text-red-600">{addError}</div>}
          <button
            onClick={saveCustomKpi}
            disabled={!addForm.kpiCode || !addForm.nameEn || !addForm.customSql}
            className="text-sm px-3 py-2 rounded-lg bg-brand-purple text-white hover:bg-brand-violet disabled:opacity-50"
          >
            Save Custom KPI
          </button>
        </div>
      )}

      {Object.entries(grouped).map(([reportCode, rows]) => (
        <div key={reportCode} className="card-padded">
          <div className="text-sm font-semibold text-ink mb-3">{REPORT_LABELS[reportCode] ?? reportCode}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3">KPI</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.kpiCode} className="border-b border-line-soft">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink">{k.nameEn}</div>
                    <div className="text-[10px] text-muted">{k.kpiCode}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-soft">{k.customSql ? "Custom SQL" : "Built-in"}</td>
                  <td className="py-2 pr-3">
                    {editingCode === k.kpiCode ? (
                      <input
                        className="field-input w-24 py-1"
                        value={editForm.targetValue}
                        onChange={(e) => setEditForm({ ...editForm, targetValue: e.target.value })}
                      />
                    ) : (
                      <span className="text-ink-soft">{k.targetValue ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {editingCode === k.kpiCode ? (
                      <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
                    ) : (
                      <button onClick={() => toggleActive(k)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                        {k.isActive ? "Active" : "Disabled"}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {editingCode === k.kpiCode ? (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => saveEdit(k.kpiCode)} disabled={saving} className="text-xs text-brand-purple font-semibold">Save</button>
                        <button onClick={() => setEditingCode(null)} className="text-xs text-muted">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(k)} className="text-xs text-brand-purple font-semibold">Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card-padded">
        <div className="text-sm font-semibold text-ink mb-3">Recent Exports</div>
        {exports.length === 0 ? (
          <div className="text-sm text-muted text-center py-6">No exports recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3">Report</th>
                <th className="py-2 pr-3">Format</th>
                <th className="py-2 pr-3">Exported By</th>
                <th className="py-2 pr-3">When</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.auditId} className="border-b border-line-soft">
                  <td className="py-2 pr-3">{e.reportCode}</td>
                  <td className="py-2 pr-3">{e.format}</td>
                  <td className="py-2 pr-3">{e.exportedByName ?? "—"}</td>
                  <td className="py-2 pr-3 text-ink-soft">{e.exportedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
