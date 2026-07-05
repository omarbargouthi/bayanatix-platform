"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  OpenDataset, OpenDataColumn, OpenDataDqIssue,
  OpenDataFormat, OpenDataRefresh, OpenDataStatus,
} from "@/lib/types";
import { ColumnPickerPanel } from "./ColumnPickerPanel";

type DimensionOpt = { code: string; name: string };

type Props = {
  mode: "create" | "edit";
  dataset: OpenDataset | null;
  initialColumns: OpenDataColumn[];
  initialDqIssues: OpenDataDqIssue[];
  dimensions: DimensionOpt[];
  canEdit: boolean;
  userId: string;
  userRole: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const DATA_CATEGORIES = [
  "Economy and Finance",
  "Education and Training",
  "Health and Population",
  "Environment and Climate",
  "Real Estate and Housing",
  "Transportation and Logistics",
  "Government and Public Services",
  "Demographics and Social",
  "Agriculture and Food",
  "Energy and Utilities",
  "Security and Safety",
  "Culture and Tourism",
  "Technology and Communications",
  "Infrastructure and Construction",
  "Legal and Judicial",
  "Science and Research",
];

const SEGMENT_OPTIONS = [
  "Investors", "Researchers", "Government", "Media", "Citizens",
  "NGOs", "Private Sector", "Students", "International Organizations",
];

const FORMAT_OPTIONS: OpenDataFormat[] = ["xlsx", "csv", "json", "xml", "parquet"];

const REFRESH_OPTIONS: { value: OpenDataRefresh; label: string }[] = [
  { value: "MONTHLY",     label: "Monthly" },
  { value: "QUARTERLY",   label: "Quarterly" },
  { value: "HALF_YEARLY", label: "Half-yearly" },
  { value: "YEARLY",      label: "Yearly" },
  { value: "ON_DEMAND",   label: "On Demand" },
];

const STATUS_LABELS: Record<OpenDataStatus, string> = {
  DRAFT:            "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED:         "Approved",
  PUBLISHED:        "Published",
  REJECTED:         "Rejected",
  PENDING:          "Pending Changes",
};

const STATUS_COLORS: Record<OpenDataStatus, string> = {
  DRAFT:            "bg-slate-100 text-slate-600 border-slate-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED:         "bg-emerald-50 text-emerald-700 border-emerald-200",
  PUBLISHED:        "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
  REJECTED:         "bg-red-50 text-red-700 border-red-200",
  PENDING:          "bg-sky-50 text-sky-700 border-sky-200",
};

// ── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label, required, children, hint,
}: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ── Multi-toggle ─────────────────────────────────────────────────────────────

function MultiToggle<T extends string>({
  options, selected, onChange, disabled,
}: {
  options: T[] | { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
  disabled?: boolean;
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o as T, label: o as string } : o as { value: T; label: string },
  );

  function toggle(v: T) {
    if (disabled) return;
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map(({ value, label }) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              active
                ? "bg-brand-purple text-white border-brand-purple"
                : "bg-white text-slate-600 border-slate-200 hover:border-brand-purple/50"
            } disabled:opacity-60 disabled:cursor-default`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Extraction logic generator ────────────────────────────────────────────────

function generateExtractionLogic(columns: OpenDataColumn[]): string {
  if (columns.length === 0) return "";

  // Group by entity
  const byEntity = new Map<number, { entityName: string; schemaName: string; sourceName: string; cols: OpenDataColumn[] }>();
  for (const col of columns) {
    if (!byEntity.has(col.entityId)) {
      byEntity.set(col.entityId, { entityName: col.entityName, schemaName: col.schemaName, sourceName: col.sourceName, cols: [] });
    }
    byEntity.get(col.entityId)!.cols.push(col);
  }

  const parts: string[] = ["-- Suggested extraction logic (auto-generated, review and edit as needed)"];

  byEntity.forEach(({ entityName, schemaName, cols }) => {
    const colList = cols.map((c) => `  ${c.physicalName}`).join(",\n");
    parts.push(`\n-- From: ${schemaName}.${entityName}\nSELECT\n${colList}\nFROM ${schemaName}.${entityName}\nWHERE <add_filter_condition>;`);
  });

  if (byEntity.size > 1) {
    const entities = [...byEntity.values()];
    const primary  = entities[0];
    const others   = entities.slice(1);

    // Look for potential join keys (columns ending in _id that appear in multiple tables)
    const primaryColNames = new Set(primary.cols.map((c) => c.physicalName.toLowerCase()));
    const joinSuggestions: string[] = [];

    for (const ent of others) {
      const commonKeys = ent.cols.filter((c) => primaryColNames.has(c.physicalName.toLowerCase()) && c.physicalName.toLowerCase().endsWith("_id"));
      if (commonKeys.length > 0) {
        joinSuggestions.push(
          `JOIN ${ent.schemaName}.${ent.entityName} ON ${primary.schemaName}.${primary.entityName}.${commonKeys[0].physicalName} = ${ent.schemaName}.${ent.entityName}.${commonKeys[0].physicalName}`,
        );
      }
    }

    if (joinSuggestions.length > 0) {
      parts.push(`\n-- Suggested JOIN across tables:\nSELECT *\nFROM ${primary.schemaName}.${primary.entityName}\n${joinSuggestions.join("\n")};`);
    }
  }

  return parts.join("\n");
}

// ── Main Editor ──────────────────────────────────────────────────────────────

export function OpenDataEditor({
  mode,
  dataset,
  initialColumns,
  initialDqIssues,
  dimensions,
  canEdit,
  userId: _userId,
  userRole,
}: Props) {
  const router = useRouter();

  // Form fields
  const [datasetId,     setDatasetId]     = useState<number | null>(dataset?.datasetId ?? null);
  const [datasetName,   setDatasetName]   = useState(dataset?.datasetName ?? "");
  const [description,   setDescription]  = useState(dataset?.descriptionText ?? "");
  const [department,    setDepartment]    = useState(dataset?.departmentText ?? "");
  const [categoryText,  setCategoryText]  = useState(dataset?.categoryText ?? "");
  const [purpose,       setPurpose]       = useState(dataset?.purposeText ?? "");
  const [segments,      setSegments]      = useState<string[]>(
    Array.isArray(dataset?.beneficiarySegments) ? dataset.beneficiarySegments : [],
  );
  const [publishDate,   setPublishDate]   = useState(dataset?.publishDate ?? "");
  const [coverageFrom,  setCoverageFrom]  = useState(String(dataset?.coverageFromYear ?? ""));
  const [coverageTo,    setCoverageTo]    = useState(String(dataset?.coverageToYear ?? ""));
  const [formats,       setFormats]       = useState<OpenDataFormat[]>(
    Array.isArray(dataset?.dataFormats) ? dataset.dataFormats : [],
  );
  const [dataSize,      setDataSize]      = useState(dataset?.dataSizeText ?? "");
  const [refreshFreq,   setRefreshFreq]   = useState<OpenDataRefresh | "">(dataset?.refreshFrequency ?? "");
  const [dqNotes,       setDqNotes]       = useState(dataset?.dqNotesText ?? "");
  const [extraction,    setExtraction]    = useState(dataset?.extractionLogic ?? "");
  const [status,        setStatus]        = useState<OpenDataStatus>(dataset?.statusCode ?? "DRAFT");

  // Columns + DQ issues
  const [columns,   setColumns]   = useState<OpenDataColumn[]>(initialColumns);
  const [dqIssues,  setDqIssues]  = useState<OpenDataDqIssue[]>(initialDqIssues);

  // UI state
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<"info" | "columns" | "extraction" | "workflow">("info");

  // Auto-refresh extraction logic when columns change (only if empty or auto-generated)
  const prevAutoLogic = useMemo(() => generateExtractionLogic(columns), [columns]);

  function maybeRefreshExtraction(newCols: OpenDataColumn[]) {
    const auto = generateExtractionLogic(newCols);
    if (!extraction || extraction === prevAutoLogic) {
      setExtraction(auto);
    }
  }

  const handleColumnAdded = useCallback((col: OpenDataColumn) => {
    setColumns((prev) => {
      const next = [...prev, col];
      maybeRefreshExtraction(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevAutoLogic, extraction]);

  const handleColumnRemoved = useCallback((odColumnId: number) => {
    setColumns((prev) => {
      const next = prev.filter((c) => c.odColumnId !== odColumnId);
      maybeRefreshExtraction(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevAutoLogic, extraction]);

  const handleColumnUpdated = useCallback((col: OpenDataColumn) => {
    setColumns((prev) => prev.map((c) => c.odColumnId === col.odColumnId ? col : c));
  }, []);

  const handleDqIssueAdded   = useCallback((i: OpenDataDqIssue) => setDqIssues((p) => [...p, i]), []);
  const handleDqIssueUpdated = useCallback((i: OpenDataDqIssue) => setDqIssues((p) => p.map((x) => x.issueId === i.issueId ? i : x)), []);
  const handleDqIssueRemoved = useCallback((id: number) => setDqIssues((p) => p.filter((i) => i.issueId !== id)), []);

  // ── Save ──────────────────────────────────────────────────────────────

  async function save() {
    if (!datasetName.trim()) { setError("Dataset name is required"); return; }
    setSaving(true);
    setError(null);

    const body = {
      datasetName:         datasetName.trim(),
      descriptionText:     description   || null,
      departmentText:      department    || null,
      categoryText:        categoryText  || null,
      purposeText:         purpose       || null,
      beneficiarySegments: segments,
      publishDate:         publishDate  || null,
      coverageFromYear:    coverageFrom ? Number(coverageFrom) : null,
      coverageToYear:      coverageTo   ? Number(coverageTo)   : null,
      dataFormats:         formats,
      dataSizeText:        dataSize     || null,
      refreshFrequency:    refreshFreq  || null,
      dqNotesText:         dqNotes      || null,
      extractionLogic:     extraction   || null,
    };

    try {
      if (mode === "create" && datasetId == null) {
        const res = await fetch("/api/open-data/datasets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { setError("Failed to create dataset"); return; }
        const { datasetId: newId } = await res.json();
        setDatasetId(newId);
        router.replace(`/open-data/${newId}`);
      } else if (datasetId != null) {
        const res = await fetch(`/api/open-data/datasets/${datasetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { setError("Failed to save dataset"); return; }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  // ── Submit for approval ───────────────────────────────────────────────

  async function submitForApproval() {
    if (!datasetId) { await save(); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to submit"); return; }
      setStatus(json.status);
    } finally {
      setSubmitting(false);
    }
  }

  async function revertToPending() {
    if (!datasetId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert_to_pending" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      setStatus(json.status);
    } finally {
      setSubmitting(false);
    }
  }

  const isEditable = canEdit && (status === "DRAFT" || status === "PENDING" || status === "REJECTED");
  const hasPii     = columns.some((c) => c.classTermIsPii);

  const tabs = [
    { key: "info",       label: "Dataset Info" },
    { key: "columns",    label: `Columns (${columns.length})` },
    { key: "extraction", label: "Extraction Logic" },
    { key: "workflow",   label: "Approval" },
  ] as const;

  return (
    <div className="max-w-5xl">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "create" ? "New Open Dataset" : datasetName || "Open Dataset"}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
            {hasPii && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">
                Contains PII — Privacy Review required
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isEditable && (
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save Draft"}
            </button>
          )}

          {isEditable && datasetId != null && (
            <button
              onClick={submitForApproval}
              disabled={submitting || columns.length === 0}
              title={columns.length === 0 ? "Add at least one column before submitting" : undefined}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit for Approval"}
            </button>
          )}

          {(status === "APPROVED" || status === "PUBLISHED") && canEdit && (
            <button
              onClick={revertToPending}
              disabled={submitting}
              className="px-4 py-2 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
            >
              Revert to Pending
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Dataset Info ── */}
      {activeTab === "info" && (
        <div className="space-y-8">
          {/* Basic info */}
          <div>
            <SectionHeading title="Basic Information" subtitle="Core attributes for this open dataset" />
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <Field label="Dataset Name" required>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    disabled={!isEditable}
                    placeholder="e.g. Real Estate Transaction Index 2024"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <div className="col-span-2">
                <Field label="Description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isEditable}
                    placeholder="Describe the dataset, its scope, and key characteristics…"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <Field label="Department Responsible">
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!isEditable}
                  placeholder="e.g. Ministry of Housing"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                />
              </Field>

              <Field label="Data Category">
                <select
                  value={categoryText}
                  onChange={(e) => setCategoryText(e.target.value)}
                  disabled={!isEditable}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                >
                  <option value="">— Select category —</option>
                  {DATA_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <div className="col-span-2">
                <Field label="Purpose for Publishing">
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    disabled={!isEditable}
                    placeholder="Explain why this dataset is being published and its intended use…"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Publication details */}
          <div>
            <SectionHeading title="Publication Details" />
            <div className="space-y-5">
              <Field label="Beneficiary Segments" hint="Select all groups expected to benefit from this dataset">
                <MultiToggle
                  options={SEGMENT_OPTIONS}
                  selected={segments}
                  onChange={setSegments}
                  disabled={!isEditable}
                />
              </Field>

              <div className="grid grid-cols-3 gap-5">
                <Field label="Publish Date">
                  <input
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    disabled={!isEditable}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label="Coverage From Year">
                  <input
                    type="number"
                    value={coverageFrom}
                    onChange={(e) => setCoverageFrom(e.target.value)}
                    disabled={!isEditable}
                    placeholder="e.g. 2020"
                    min={1990}
                    max={2100}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label="Coverage To Year">
                  <input
                    type="number"
                    value={coverageTo}
                    onChange={(e) => setCoverageTo(e.target.value)}
                    disabled={!isEditable}
                    placeholder="e.g. 2024"
                    min={1990}
                    max={2100}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <Field label="Output Formats">
                <MultiToggle
                  options={FORMAT_OPTIONS}
                  selected={formats}
                  onChange={setFormats as (v: string[]) => void}
                  disabled={!isEditable}
                />
              </Field>

              <div className="grid grid-cols-2 gap-5">
                <Field label="Data Size" hint="Approximate size, e.g. 250 MB, 1.2 GB">
                  <input
                    type="text"
                    value={dataSize}
                    onChange={(e) => setDataSize(e.target.value)}
                    disabled={!isEditable}
                    placeholder="e.g. 450 MB"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label="Refresh Frequency">
                  <select
                    value={refreshFreq}
                    onChange={(e) => setRefreshFreq(e.target.value as OpenDataRefresh | "")}
                    disabled={!isEditable}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  >
                    <option value="">— Select frequency —</option>
                    {REFRESH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          {/* Dataset-level DQ notes */}
          <div>
            <SectionHeading title="Data Quality Notes" subtitle="Known data quality considerations at the dataset level" />
            <Field label="DQ Notes">
              <textarea
                value={dqNotes}
                onChange={(e) => setDqNotes(e.target.value)}
                disabled={!isEditable}
                placeholder="Describe any known data quality limitations, caveats, or completeness gaps…"
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
              />
            </Field>
          </div>

          {/* Save bar at bottom of info tab */}
          {isEditable && (
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Columns ── */}
      {activeTab === "columns" && (
        <div>
          <SectionHeading
            title="Dataset Columns"
            subtitle="Select the individual columns to include in this open dataset. Column-level DQ issues can be noted here."
          />

          {datasetId == null && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              Save the dataset first before adding columns.
              <button
                onClick={save}
                disabled={saving}
                className="ml-3 underline font-medium"
              >
                {saving ? "Saving…" : "Save now"}
              </button>
            </div>
          )}

          <ColumnPickerPanel
            datasetId={datasetId}
            selectedColumns={columns}
            dqIssues={dqIssues}
            dimensions={dimensions}
            canEdit={isEditable && datasetId != null}
            mySources={userRole === "STEWARD"}
            onColumnAdded={handleColumnAdded}
            onColumnRemoved={handleColumnRemoved}
            onColumnUpdated={handleColumnUpdated}
            onDqIssueAdded={handleDqIssueAdded}
            onDqIssueUpdated={handleDqIssueUpdated}
            onDqIssueRemoved={handleDqIssueRemoved}
          />
        </div>
      )}

      {/* ── Tab: Extraction Logic ── */}
      {activeTab === "extraction" && (
        <div>
          <SectionHeading
            title="Data Extraction Logic"
            subtitle="Suggested SQL or extraction steps to pull the selected columns from the source system. Auto-generated based on selected columns — edit as needed."
          />

          {columns.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-sm">Select columns first to generate extraction logic.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {isEditable && (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => setExtraction(generateExtractionLogic(columns))}
                    className="text-xs text-brand-purple hover:underline"
                  >
                    ↺ Re-generate from selected columns
                  </button>
                </div>
              )}
              <textarea
                value={extraction}
                onChange={(e) => setExtraction(e.target.value)}
                disabled={!isEditable}
                spellCheck={false}
                rows={20}
                className="w-full px-4 py-3 font-mono text-xs border border-slate-200 rounded-xl bg-slate-950 text-emerald-300 resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:opacity-80"
              />
              {isEditable && (
                <div className="flex justify-end">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
                  >
                    {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Workflow / Approval ── */}
      {activeTab === "workflow" && (
        <div className="space-y-6">
          <SectionHeading
            title="Approval Workflow"
            subtitle="Open data publication follows a four-stage review process."
          />

          {/* Workflow stages diagram */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { stage: 1, name: "Steward Review",  role: "Data Steward",        sla: "3 days",  active: status === "PENDING_APPROVAL" },
              { stage: 2, name: "Owner Approval",  role: "Data Owner",          sla: "5 days",  active: false },
              { stage: 3, name: "Privacy Review",  role: "Privacy Officer",     sla: "3 days",  note: hasPii ? undefined : "Skipped if no PII", active: false },
              { stage: 4, name: "DMO Sign-off",    role: "DMO Admin",           sla: "3 days",  active: false },
            ].map((s) => (
              <div
                key={s.stage}
                className={`rounded-xl border p-4 ${s.active ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
              >
                <div className="text-xs font-semibold text-slate-400 mb-1">Stage {s.stage}</div>
                <div className="font-medium text-sm text-slate-800">{s.name}</div>
                <div className="text-xs text-slate-500 mt-1">{s.role}</div>
                <div className="text-xs text-slate-400 mt-0.5">SLA: {s.sla}</div>
                {s.note && <div className="text-xs text-slate-400 mt-1 italic">{s.note}</div>}
              </div>
            ))}
          </div>

          {/* Current status panel */}
          <div className={`rounded-xl border p-5 ${STATUS_COLORS[status]}`}>
            <div className="font-semibold text-base mb-1">Current Status: {STATUS_LABELS[status]}</div>
            {status === "DRAFT" && (
              <p className="text-sm opacity-80">
                Complete the dataset info and add at least one column, then submit for approval to start the workflow.
              </p>
            )}
            {status === "PENDING" && (
              <p className="text-sm opacity-80">
                The dataset is pending changes. Edit as needed and resubmit for approval.
              </p>
            )}
            {status === "PENDING_APPROVAL" && (
              <p className="text-sm opacity-80">
                The dataset is in the approval workflow. Reviewers have been notified. You will be updated when each stage completes.
              </p>
            )}
            {status === "APPROVED" && (
              <p className="text-sm opacity-80">
                The dataset has been approved. An administrator can publish it. You can revert it to Pending if changes are needed.
              </p>
            )}
            {status === "PUBLISHED" && (
              <p className="text-sm opacity-80">
                The dataset is published and publicly available.
              </p>
            )}
            {status === "REJECTED" && (
              <p className="text-sm opacity-80">
                The dataset was rejected during review. Update it and resubmit.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {(status === "DRAFT" || status === "PENDING" || status === "REJECTED") && canEdit && (
              <button
                onClick={submitForApproval}
                disabled={submitting || columns.length === 0 || datasetId == null}
                title={columns.length === 0 ? "Add at least one column first" : undefined}
                className="px-5 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
              >
                {submitting ? "Submitting…" : "Submit for Approval"}
              </button>
            )}

            {(status === "APPROVED" || status === "PUBLISHED") && canEdit && (
              <button
                onClick={revertToPending}
                disabled={submitting}
                className="px-5 py-2 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
              >
                {submitting ? "…" : "Revert to Pending Changes"}
              </button>
            )}
          </div>

          {hasPii && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>Privacy Notice:</strong> This dataset contains columns classified as PII.
              The Privacy Officer review stage (Stage 3) is mandatory before DMO sign-off.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
