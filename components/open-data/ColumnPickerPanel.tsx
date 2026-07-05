"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ClassificationColumn } from "@/app/api/classification/columns/route";
import type { OpenDataColumn, OpenDataDqIssue } from "@/lib/types";
import { ClassificationTag } from "@/components/ui/Tag";

type DqDimension = { code: string; name: string };

type Props = {
  datasetId: number | null;
  selectedColumns: OpenDataColumn[];
  dqIssues: OpenDataDqIssue[];
  dimensions: DqDimension[];
  canEdit: boolean;
  onColumnAdded: (col: OpenDataColumn) => void;
  onColumnRemoved: (odColumnId: number) => void;
  onDqIssueAdded: (issue: OpenDataDqIssue) => void;
  onDqIssueRemoved: (issueId: number) => void;
};

function DqScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const pct = Math.round(score);
  const color = pct >= 80 ? "text-emerald-600 bg-emerald-50" : pct >= 50 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${color}`}>{pct}%</span>;
}

export function ColumnPickerPanel({
  datasetId,
  selectedColumns,
  dqIssues,
  dimensions,
  canEdit,
  onColumnAdded,
  onColumnRemoved,
  onDqIssueAdded,
  onDqIssueRemoved,
}: Props) {
  const [search, setSearch]         = useState("");
  const [results, setResults]       = useState<ClassificationColumn[]>([]);
  const [searching, setSearching]   = useState(false);
  const [adding, setAdding]         = useState<number | null>(null);

  // DQ issue form per column (attributeId → form state)
  const [dqForms, setDqForms] = useState<
    Record<number, { open: boolean; dimension: string; text: string; severity: string }>
  >({});

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAttrIds = new Set(selectedColumns.map((c) => c.attributeId));

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/classification/columns?search=${encodeURIComponent(q)}&limit=30`);
      const json = await res.json();
      setResults((json.data as ClassificationColumn[]) ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, doSearch]);

  async function addColumn(col: ClassificationColumn) {
    if (!datasetId) return;
    setAdding(col.attributeId);
    try {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributeId: col.attributeId }),
      });
      if (!res.ok) return;
      const { odColumnId } = await res.json();

      const newCol: OpenDataColumn = {
        odColumnId,
        datasetId: datasetId!,
        attributeId:   col.attributeId,
        physicalName:  col.physicalName,
        friendlyName:  null,
        dataType:      col.dataType,
        publishName:   null,
        publishDesc:   null,
        sortOrder:     selectedColumns.length,
        entityName:    col.entityName,
        entityId:      col.entityId,
        schemaName:    col.schemaName,
        schemaId:      col.schemaId,
        sourceName:    col.sourceName,
        classTermName: col.classTermName,
        classTermCode: col.classTermClassCode,
        classTermIsPii: col.classTermIsPii,
        dqScore:       null,
        dqRuleCount:   0,
      };
      onColumnAdded(newCol);
    } finally {
      setAdding(null);
    }
  }

  async function removeColumn(col: OpenDataColumn) {
    if (!datasetId) return;
    await fetch(`/api/open-data/datasets/${datasetId}/columns/${col.odColumnId}`, { method: "DELETE" });
    onColumnRemoved(col.odColumnId);
  }

  function toggleDqForm(attributeId: number) {
    setDqForms((prev) => ({
      ...prev,
      [attributeId]: prev[attributeId]
        ? { ...prev[attributeId], open: !prev[attributeId].open }
        : { open: true, dimension: "", text: "", severity: "WARNING" },
    }));
  }

  async function submitDqIssue(attributeId: number) {
    if (!datasetId) return;
    const form = dqForms[attributeId];
    if (!form?.text.trim()) return;

    const res = await fetch(`/api/open-data/datasets/${datasetId}/dq-issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attributeId,
        dimensionCode: form.dimension || null,
        issueText:     form.text.trim(),
        severityCode:  form.severity,
      }),
    });
    if (!res.ok) return;
    const { issueId } = await res.json();

    const dim = dimensions.find((d) => d.code === form.dimension);
    onDqIssueAdded({
      issueId,
      datasetId: datasetId!,
      attributeId,
      columnName:    selectedColumns.find((c) => c.attributeId === attributeId)?.physicalName ?? null,
      dimensionCode: form.dimension || null,
      dimensionName: dim?.name ?? null,
      issueText:     form.text.trim(),
      severityCode:  form.severity as "BLOCKER" | "WARNING" | "INFO",
      createdAt:     new Date().toISOString(),
    });

    setDqForms((prev) => ({ ...prev, [attributeId]: { open: false, dimension: "", text: "", severity: "WARNING" } }));
  }

  async function removeDqIssue(issueId: number) {
    if (!datasetId) return;
    await fetch(`/api/open-data/datasets/${datasetId}/dq-issues?issueId=${issueId}`, { method: "DELETE" });
    onDqIssueRemoved(issueId);
  }

  const severityColors = { BLOCKER: "text-red-600", WARNING: "text-amber-600", INFO: "text-slate-500" };

  return (
    <div className="space-y-6">
      {/* ── Search box ── */}
      {canEdit && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Search and add columns
          </label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type column name, table, or schema…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 animate-pulse">
                Searching…
              </span>
            )}
          </div>

          {/* Search results */}
          {results.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm max-h-72 overflow-y-auto">
              {results.map((col) => {
                const already = selectedAttrIds.has(col.attributeId);
                return (
                  <div
                    key={col.attributeId}
                    className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-800">{col.physicalName}</span>
                        <span className="text-xs text-slate-400">{col.dataType}</span>
                        {col.classTermIsPii && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">PII</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {col.sourceName} › {col.schemaName} › {col.entityName}
                      </div>
                      {col.classTermName && (
                        <div className="mt-1">
                          <ClassificationTag code={col.classTermClassCode} />
                          <span className="ml-1 text-xs text-slate-500">{col.classTermName}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => !already && addColumn(col)}
                      disabled={already || adding === col.attributeId}
                      className={`ml-3 shrink-0 px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                        already
                          ? "bg-slate-100 text-slate-400 cursor-default"
                          : "bg-brand-purple text-white hover:bg-brand-purple/90"
                      }`}
                    >
                      {already ? "Added" : adding === col.attributeId ? "…" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!searching && search.trim() && results.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">No columns found matching "{search}"</p>
          )}
        </div>
      )}

      {/* ── Selected columns ── */}
      {selectedColumns.length === 0 ? (
        <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
          <p className="text-sm">No columns selected yet.</p>
          {canEdit && <p className="text-xs mt-1">Use the search above to add columns.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            Selected columns ({selectedColumns.length})
          </p>

          {selectedColumns.map((col) => {
            const colIssues = dqIssues.filter((i) => i.attributeId === col.attributeId);
            const dqForm    = dqForms[col.attributeId];

            return (
              <div key={col.odColumnId} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                {/* Column header row */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800">{col.physicalName}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{col.dataType}</span>
                      {col.classTermCode && (
                        <ClassificationTag code={col.classTermCode} />
                      )}
                      {col.classTermIsPii && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium border border-red-100">PII</span>
                      )}
                      {col.dqScore != null && <DqScoreBadge score={col.dqScore} />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {col.sourceName} › {col.schemaName} › {col.entityName}
                    </div>
                    {col.classTermName && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Classification: {col.classTermName}
                      </div>
                    )}
                    {col.dqRuleCount > 0 && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {col.dqRuleCount} DQ rule{col.dqRuleCount > 1 ? "s" : ""} linked
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleDqForm(col.attributeId)}
                        className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        + DQ Issue
                      </button>
                      <button
                        onClick={() => removeColumn(col)}
                        className="text-xs px-2.5 py-1 border border-red-100 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Existing DQ issues for this column */}
                {colIssues.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 space-y-1.5">
                    {colIssues.map((issue) => (
                      <div key={issue.issueId} className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {issue.dimensionName && (
                              <span className="text-[11px] font-medium text-slate-500">{issue.dimensionName}</span>
                            )}
                            <span className={`text-[11px] font-medium ${severityColors[issue.severityCode]}`}>
                              {issue.severityCode}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-0.5">{issue.issueText}</p>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => removeDqIssue(issue.issueId)}
                            className="text-xs text-red-400 hover:text-red-600 shrink-0"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* DQ issue add form */}
                {dqForm?.open && (
                  <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-amber-700">Add DQ Issue Note</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={dqForm.dimension}
                        onChange={(e) => setDqForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], dimension: e.target.value } }))}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="">— DQ Dimension (optional) —</option>
                        {dimensions.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                      <select
                        value={dqForm.severity}
                        onChange={(e) => setDqForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], severity: e.target.value } }))}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="INFO">Info</option>
                        <option value="WARNING">Warning</option>
                        <option value="BLOCKER">Blocker</option>
                      </select>
                    </div>
                    <textarea
                      value={dqForm.text}
                      onChange={(e) => setDqForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], text: e.target.value } }))}
                      placeholder="Describe the data quality issue for this column in the context of this dataset…"
                      rows={2}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitDqIssue(col.attributeId)}
                        disabled={!dqForm.text.trim()}
                        className="px-3 py-1 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                      >
                        Save Issue
                      </button>
                      <button
                        onClick={() => toggleDqForm(col.attributeId)}
                        className="px-3 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
