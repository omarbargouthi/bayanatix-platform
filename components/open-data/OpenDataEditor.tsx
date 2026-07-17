"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  OpenDataset, OpenDataColumn, OpenDataDqIssue,
  OpenDataFormat, OpenDataRefresh, OpenDataStatus,
} from "@/lib/types";
import { ColumnPickerPanel } from "./ColumnPickerPanel";
import { useLang } from "@/lib/lang-context";

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

const FORMAT_OPTIONS: OpenDataFormat[] = ["xlsx", "csv", "json", "xml", "parquet"];

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
  const { t, lang } = useLang();

  // ── Fetch dataset categories from the shared data_categories table ─────
  type CatNode = { categoryId: number; name: string; nameAr: string | null; children: CatNode[] };
  const [categoryOptions, setCategoryOptions] = useState<{ id: number; label: string; depth: number }[]>([]);
  useEffect(() => {
    fetch("/api/retention/categories")
      .then((r) => r.json())
      .then((roots: CatNode[]) => {
        const flat: { id: number; label: string; depth: number }[] = [];
        function walk(nodes: CatNode[], depth: number) {
          for (const n of nodes) {
            flat.push({ id: n.categoryId, label: lang === "ar" && n.nameAr ? n.nameAr : n.name, depth });
            if (n.children?.length) walk(n.children, depth + 1);
          }
        }
        walk(roots, 0);
        setCategoryOptions(flat);
      })
      .catch(() => {});
  }, [lang]);

  const STATUS_LABELS: Record<OpenDataStatus, string> = {
    DRAFT:            t.openData.statusDraft,
    PENDING_APPROVAL: t.openData.statusPendingApproval,
    APPROVED:         t.openData.statusApproved,
    PUBLISHED:        t.openData.statusPublished,
    REJECTED:         t.openData.statusRejected,
    PENDING:          t.openData.statusPending,
  };

  const SEGMENT_OPTIONS_L: { value: string; label: string }[] = [
    { value: "Investors",               label: t.openData.segments.investors },
    { value: "Researchers",             label: t.openData.segments.researchers },
    { value: "Government",              label: t.openData.segments.government },
    { value: "Media",                   label: t.openData.segments.media },
    { value: "Citizens",                label: t.openData.segments.citizens },
    { value: "NGOs",                    label: t.openData.segments.ngos },
    { value: "Private Sector",          label: t.openData.segments.privateSector },
    { value: "Students",                label: t.openData.segments.students },
    { value: "International Organizations", label: t.openData.segments.internationalOrgs },
  ];

  const REFRESH_OPTIONS: { value: OpenDataRefresh; label: string }[] = [
    { value: "MONTHLY",     label: t.openData.refreshMonthly },
    { value: "QUARTERLY",   label: t.openData.refreshQuarterly },
    { value: "HALF_YEARLY", label: t.openData.refreshHalfYearly },
    { value: "YEARLY",      label: t.openData.refreshYearly },
    { value: "ON_DEMAND",   label: t.openData.refreshOnDemand },
  ];

  // Form fields
  const [datasetId,     setDatasetId]     = useState<number | null>(dataset?.datasetId ?? null);
  const [datasetName,   setDatasetName]   = useState(dataset?.datasetName ?? "");
  const [description,   setDescription]  = useState(dataset?.descriptionText ?? "");
  const [department,    setDepartment]    = useState(dataset?.departmentText ?? "");
  const [categoryId,    setCategoryId]    = useState<number | null>(dataset?.categoryId ?? null);
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
      categoryId:          categoryId    ?? null,
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
    { key: "info",       label: t.openData.tabInfo },
    { key: "columns",    label: t.openData.tabColumns.replace("{n}", String(columns.length)) },
    { key: "extraction", label: t.openData.tabExtraction },
    { key: "workflow",   label: t.openData.tabApproval },
  ] as const;

  return (
    <div className="max-w-5xl">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "create" ? t.openData.titleCreate : datasetName || t.openData.pageTitle}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
            {hasPii && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">
                {t.openData.containsPii}
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
              {saving ? t.openData.savingLabel : saved ? t.openData.savedCheck : t.openData.saveDraft}
            </button>
          )}

          {isEditable && datasetId != null && (
            <button
              onClick={submitForApproval}
              disabled={submitting || columns.length === 0}
              title={columns.length === 0 ? t.openData.addColumnFirst : undefined}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
            >
              {submitting ? t.openData.submittingLabel : t.openData.submitApproval}
            </button>
          )}

          {(status === "APPROVED" || status === "PUBLISHED") && canEdit && (
            <button
              onClick={revertToPending}
              disabled={submitting}
              className="px-4 py-2 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
            >
              {t.openData.revertPendingBtn}
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
            <SectionHeading title={t.openData.sectionBasic} subtitle={t.openData.sectionBasicSub} />
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <Field label={t.openData.fieldName} required>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldNamePlaceholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <div className="col-span-2">
                <Field label={t.openData.fieldDesc}>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldDescPlaceholder}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <Field label={t.openData.fieldDept}>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!isEditable}
                  placeholder={t.openData.fieldDeptPlaceholder}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                />
              </Field>

              <Field label={t.openData.fieldCategory}>
                <select
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                  disabled={!isEditable}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                >
                  <option value="">{t.openData.selectCategory}</option>
                  {categoryOptions.map(({ id, label, depth }) => (
                    <option key={id} value={id}>
                      {depth > 0 ? "   → " : ""}{label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="col-span-2">
                <Field label={t.openData.fieldPurpose}>
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldPurposePlaceholder}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Publication details */}
          <div>
            <SectionHeading title={t.openData.sectionPublication} />
            <div className="space-y-5">
              <Field label={t.openData.fieldSegments} hint={t.openData.fieldSegmentsHint}>
                <MultiToggle
                  options={SEGMENT_OPTIONS_L}
                  selected={segments}
                  onChange={setSegments}
                  disabled={!isEditable}
                />
              </Field>

              <div className="grid grid-cols-3 gap-5">
                <Field label={t.openData.fieldPublishDate}>
                  <input
                    type="date"
                    value={publishDate}
                    onChange={(e) => setPublishDate(e.target.value)}
                    disabled={!isEditable}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label={t.openData.fieldCoverageFrom}>
                  <input
                    type="number"
                    value={coverageFrom}
                    onChange={(e) => setCoverageFrom(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldCoverageFromPh}
                    min={1990}
                    max={2100}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label={t.openData.fieldCoverageTo}>
                  <input
                    type="number"
                    value={coverageTo}
                    onChange={(e) => setCoverageTo(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldCoverageToPh}
                    min={1990}
                    max={2100}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>
              </div>

              <Field label={t.openData.fieldFormats}>
                <MultiToggle
                  options={FORMAT_OPTIONS}
                  selected={formats}
                  onChange={setFormats as (v: string[]) => void}
                  disabled={!isEditable}
                />
              </Field>

              <div className="grid grid-cols-2 gap-5">
                <Field label={t.openData.fieldSize} hint={t.openData.fieldSizeHint}>
                  <input
                    type="text"
                    value={dataSize}
                    onChange={(e) => setDataSize(e.target.value)}
                    disabled={!isEditable}
                    placeholder={t.openData.fieldSizePh}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  />
                </Field>

                <Field label={t.openData.fieldRefreshFreq}>
                  <select
                    value={refreshFreq}
                    onChange={(e) => setRefreshFreq(e.target.value as OpenDataRefresh | "")}
                    disabled={!isEditable}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-purple/30 disabled:bg-slate-50"
                  >
                    <option value="">{t.openData.selectFrequency}</option>
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
            <SectionHeading title={t.openData.sectionDqNotes} subtitle={t.openData.sectionDqNotesSub} />
            <Field label={t.openData.fieldDqNotes}>
              <textarea
                value={dqNotes}
                onChange={(e) => setDqNotes(e.target.value)}
                disabled={!isEditable}
                placeholder={t.openData.fieldDqNotesPh}
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
                {saving ? t.openData.savingLabel : saved ? t.openData.savedCheck : t.openData.saveBtn}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Columns ── */}
      {activeTab === "columns" && (
        <div>
          <SectionHeading
            title={t.openData.sectionColumns}
            subtitle={t.openData.sectionColumnsSub}
          />

          {datasetId == null && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              {t.openData.saveFirstWarning}
              <button
                onClick={save}
                disabled={saving}
                className="ml-3 underline font-medium"
              >
                {saving ? t.openData.savingLabel : t.openData.saveNow}
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
            title={t.openData.sectionExtraction}
            subtitle={t.openData.sectionExtractionSub}
          />

          {columns.length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              <p className="text-sm">{t.openData.noColumnsExtraction}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {isEditable && (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => setExtraction(generateExtractionLogic(columns))}
                    className="text-xs text-brand-purple hover:underline"
                  >
                    {t.openData.regenerateBtn}
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
                    {saving ? t.openData.savingLabel : saved ? t.openData.savedCheck : t.openData.saveBtn}
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
            title={t.openData.sectionApproval}
            subtitle={t.openData.sectionApprovalSub}
          />

          {/* Workflow stages diagram */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { stage: 1, name: t.openData.stageStewardReview, role: t.openData.roleSteward,  sla: "3 days", active: status === "PENDING_APPROVAL" },
              { stage: 2, name: t.openData.stageOwnerApproval, role: t.openData.roleOwner,    sla: "5 days", active: false },
              { stage: 3, name: t.openData.stagePrivacyReview, role: t.openData.rolePrivacy,  sla: "3 days", note: hasPii ? undefined : t.openData.skippedNoPii, active: false },
              { stage: 4, name: t.openData.stageDmoSignoff,    role: t.openData.roleDmo,      sla: "3 days", active: false },
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
            <div className="font-semibold text-base mb-1">{t.openData.currentStatus.replace("{status}", STATUS_LABELS[status])}</div>
            {status === "DRAFT"            && <p className="text-sm opacity-80">{t.openData.statusDescDraft}</p>}
            {status === "PENDING"          && <p className="text-sm opacity-80">{t.openData.statusDescPending}</p>}
            {status === "PENDING_APPROVAL" && <p className="text-sm opacity-80">{t.openData.statusDescPendingApproval}</p>}
            {status === "APPROVED"         && <p className="text-sm opacity-80">{t.openData.statusDescApproved}</p>}
            {status === "PUBLISHED"        && <p className="text-sm opacity-80">{t.openData.statusDescPublished}</p>}
            {status === "REJECTED"         && <p className="text-sm opacity-80">{t.openData.statusDescRejected}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {(status === "DRAFT" || status === "PENDING" || status === "REJECTED") && canEdit && (
              <button
                onClick={submitForApproval}
                disabled={submitting || columns.length === 0 || datasetId == null}
                title={columns.length === 0 ? t.openData.addColumnFirst : undefined}
                className="px-5 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-purple/90 disabled:opacity-60 transition-colors"
              >
                {submitting ? t.openData.submittingLabel : t.openData.submitApproval}
              </button>
            )}

            {(status === "APPROVED" || status === "PUBLISHED") && canEdit && (
              <button
                onClick={revertToPending}
                disabled={submitting}
                className="px-5 py-2 border border-amber-200 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
              >
                {submitting ? "…" : t.openData.revertPendingBtn}
              </button>
            )}
          </div>

          {hasPii && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <strong>{t.openData.privacyNotice}</strong> {t.openData.privacyNoticeText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
