"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ClassificationColumn } from "@/app/api/classification/columns/route";
import type { ColumnDqRule } from "@/app/api/open-data/column-dq/route";
import type { OpenDataColumn, OpenDataDqIssue } from "@/lib/types";
import { ClassificationTag } from "@/components/ui/Tag";

type DqDimension = { code: string; name: string };
type PublicTerm  = { glossaryId: number; termName: string; classificationCode: string | null };

type DqIssueFormState = {
  open:      boolean;
  issueId:   number | null;
  dimension: string;
  text:      string;
  severity:  string;
};

type ReclassifyFormState = {
  open:    boolean;
  termId:  string;
  reason:  string;
  saving:  boolean;
};

type DeidentifyFormState = {
  open:   boolean;
  method: string;
  notes:  string;
  saving: boolean;
};

const RESTRICTED_CODES     = new Set(["CONFIDENTIAL", "RESTRICTED", "SECRET", "TOP_SECRET", "PII"]);
const DIRECT_ID_CATEGORY   = "DIRECT_ID";

const DEIDENT_METHOD_LABELS: Record<string, string> = {
  AGE_BRACKET:      "Age Bracket (e.g. 25–34)",
  SALARY_BRACKET:   "Salary Bracket (e.g. 5,000–10,000)",
  CITY_ONLY:        "City Only (suppress street / area)",
  DATE_YEAR:        "Year Only (suppress month / day)",
  PSEUDONYMIZATION: "Pseudonymization (replace with token)",
  GENERALIZATION:   "Generalization (reduce precision)",
  CUSTOM:           "Custom (described in notes)",
};

function isRestricted(code: string | null | undefined): boolean {
  return !!code && RESTRICTED_CODES.has(code.toUpperCase());
}

type Props = {
  datasetId: number | null;
  selectedColumns: OpenDataColumn[];
  dqIssues: OpenDataDqIssue[];
  dimensions: DqDimension[];
  canEdit: boolean;
  mySources?: boolean;
  onColumnAdded:    (col: OpenDataColumn) => void;
  onColumnRemoved:  (odColumnId: number) => void;
  onColumnUpdated:  (col: OpenDataColumn) => void;
  onDqIssueAdded:   (issue: OpenDataDqIssue) => void;
  onDqIssueUpdated: (issue: OpenDataDqIssue) => void;
  onDqIssueRemoved: (issueId: number) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function DqScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const pct   = Math.round(score);
  const color = pct >= 80
    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
    : pct >= 50
    ? "text-amber-600 bg-amber-50 border-amber-200"
    : "text-red-600 bg-red-50 border-red-200";
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${color}`}>{pct}%</span>;
}

function RuleStatusBadge({ status, score }: { status: string | null; score: number | null }) {
  if (!status) return <span className="text-xs text-slate-400">Not run</span>;
  const cfg = status === "PASSED"
    ? { bg: "bg-emerald-50 text-emerald-700", icon: "✓" }
    : status === "FAILED"
    ? { bg: "bg-red-50 text-red-600",     icon: "✗" }
    : { bg: "bg-slate-100 text-slate-500",  icon: "!" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${cfg.bg}`}>
      <span>{cfg.icon}</span>
      {status}
      {score != null && <span className="opacity-70">({Math.round(score)}%)</span>}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ColumnPickerPanel({
  datasetId,
  selectedColumns,
  dqIssues,
  dimensions,
  canEdit,
  mySources = false,
  onColumnAdded,
  onColumnRemoved,
  onColumnUpdated,
  onDqIssueAdded,
  onDqIssueUpdated,
  onDqIssueRemoved,
}: Props) {
  const [search, setSearch]       = useState("");
  const [results, setResults]     = useState<ClassificationColumn[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding]       = useState<number | null>(null);
  const [addError, setAddError]   = useState<string | null>(null);

  // DQ rules per column (attributeId → rules), fetched lazily
  const [dqRules, setDqRules]           = useState<Record<number, ColumnDqRule[]>>({});
  const [rulesLoading, setRulesLoading] = useState<Record<number, boolean>>({});

  // DQ issue form per column
  const [dqForms, setDqForms] = useState<Record<number, DqIssueFormState>>({});

  // Re-classification form per column (attributeId → form)
  const [reclassifyForms, setReclassifyForms] = useState<Record<number, ReclassifyFormState>>({});
  const [publicTerms, setPublicTerms]         = useState<PublicTerm[] | null>(null);
  const [termsLoading, setTermsLoading]       = useState(false);

  // De-identification form per column
  const [deidentifyForms, setDeidentifyForms] = useState<Record<number, DeidentifyFormState>>({});

  const searchTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedAttrIds  = new Set(selectedColumns.map((c) => c.attributeId));

  // ── Search ─────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const msParam = mySources ? "&mySources=true" : "";
      const res  = await fetch(`/api/classification/columns?search=${encodeURIComponent(q)}&limit=30${msParam}`);
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

  // ── Fetch DQ rules for a column ────────────────────────────────────────────

  async function fetchDqRules(attributeId: number) {
    if (dqRules[attributeId] !== undefined) return;
    setRulesLoading((p) => ({ ...p, [attributeId]: true }));
    try {
      const res  = await fetch(`/api/open-data/column-dq?attributeId=${attributeId}`);
      const data = await res.json();
      setDqRules((p) => ({ ...p, [attributeId]: Array.isArray(data) ? data : [] }));
    } finally {
      setRulesLoading((p) => ({ ...p, [attributeId]: false }));
    }
  }

  // ── Fetch available public terms (once) ───────────────────────────────────

  async function ensurePublicTerms() {
    if (publicTerms !== null || termsLoading) return;
    setTermsLoading(true);
    try {
      const res  = await fetch("/api/open-data/public-terms");
      const data = await res.json();
      setPublicTerms(Array.isArray(data) ? data : []);
    } finally {
      setTermsLoading(false);
    }
  }

  // ── Add column ─────────────────────────────────────────────────────────────

  async function addColumn(col: ClassificationColumn) {
    if (!datasetId) return;

    // Block direct identifiers entirely
    if (col.classTermPiCategoryCode === DIRECT_ID_CATEGORY) {
      setAddError(
        `"${col.physicalName}" is a direct identifier (national ID, SIN, phone number, full name, etc.) and cannot be included in open data under any circumstances.`
      );
      setTimeout(() => setAddError(null), 7000);
      return;
    }

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
        datasetId:                 datasetId!,
        attributeId:               col.attributeId,
        physicalName:              col.physicalName,
        friendlyName:              null,
        dataType:                  col.dataType,
        publishName:               null,
        publishDesc:               null,
        sortOrder:                 selectedColumns.length,
        entityName:                col.entityName,
        entityId:                  col.entityId,
        schemaName:                col.schemaName,
        schemaId:                  col.schemaId,
        sourceName:                col.sourceName,
        classTermName:             col.classTermName,
        classTermCode:             col.classTermClassCode,
        classTermIsPii:            col.classTermIsPii,
        classTermPiCategory:       col.classTermPiCategoryCode,
        dqScore:                   null,
        dqRuleCount:               0,
        reclassificationReason:    null,
        reclassificationRequestId: null,
        deidentificationMethod:    null,
        deidentificationNotes:     null,
      };
      onColumnAdded(newCol);
      fetchDqRules(col.attributeId);

      // Auto-open re-classification form for restricted / unclassified columns
      if (isRestricted(col.classTermClassCode) || !col.classTermClassCode) {
        ensurePublicTerms();
        setReclassifyForms((p) => ({
          ...p,
          [col.attributeId]: { open: true, termId: "", reason: "", saving: false },
        }));
      }

      // Auto-open de-identification form for non-direct-id PII columns
      if (col.classTermIsPii && col.classTermPiCategoryCode !== DIRECT_ID_CATEGORY) {
        setDeidentifyForms((p) => ({
          ...p,
          [col.attributeId]: { open: true, method: "", notes: "", saving: false },
        }));
      }
    } finally {
      setAdding(null);
    }
  }

  async function removeColumn(col: OpenDataColumn) {
    if (!datasetId) return;
    await fetch(`/api/open-data/datasets/${datasetId}/columns/${col.odColumnId}`, { method: "DELETE" });
    onColumnRemoved(col.odColumnId);
  }

  // ── Re-classification helpers ──────────────────────────────────────────────

  function openReclassifyForm(attributeId: number) {
    ensurePublicTerms();
    setReclassifyForms((p) => ({
      ...p,
      [attributeId]: p[attributeId]?.saving
        ? p[attributeId]
        : { open: true, termId: p[attributeId]?.termId ?? "", reason: p[attributeId]?.reason ?? "", saving: false },
    }));
  }

  function closeReclassifyForm(attributeId: number) {
    setReclassifyForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], open: false } }));
  }

  function updateReclassifyField(attributeId: number, field: "termId" | "reason", value: string) {
    setReclassifyForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], [field]: value } }));
  }

  async function submitReclassify(col: OpenDataColumn) {
    if (!datasetId) return;
    const form = reclassifyForms[col.attributeId];
    if (!form || !form.termId || !form.reason.trim()) return;

    setReclassifyForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], saving: true } }));
    try {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/reclassify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributeId: col.attributeId,
          newTermId:   Number(form.termId),
          reason:      form.reason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "Re-classification failed. Please try again.");
        return;
      }
      const result = await res.json() as {
        ok: boolean; requestId: number;
        newTermName: string; newTermCode: string | null; isPii: boolean;
      };

      const updated: OpenDataColumn = {
        ...col,
        classTermName:             result.newTermName,
        classTermCode:             result.newTermCode,
        classTermIsPii:            result.isPii,
        reclassificationReason:    form.reason.trim(),
        reclassificationRequestId: result.requestId,
      };
      onColumnUpdated(updated);

      setReclassifyForms((p) => ({ ...p, [col.attributeId]: { open: false, termId: "", reason: "", saving: false } }));
    } finally {
      setReclassifyForms((p) => ({
        ...p,
        [col.attributeId]: { ...p[col.attributeId], saving: false },
      }));
    }
  }

  // ── De-identification helpers ──────────────────────────────────────────────

  function openDeidentifyForm(attributeId: number, currentMethod?: string | null, currentNotes?: string | null) {
    setDeidentifyForms((p) => ({
      ...p,
      [attributeId]: p[attributeId]?.saving
        ? p[attributeId]
        : { open: true, method: currentMethod ?? p[attributeId]?.method ?? "", notes: currentNotes ?? p[attributeId]?.notes ?? "", saving: false },
    }));
  }

  function closeDeidentifyForm(attributeId: number) {
    setDeidentifyForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], open: false } }));
  }

  function updateDeidentifyField(attributeId: number, field: "method" | "notes", value: string) {
    setDeidentifyForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], [field]: value } }));
  }

  async function submitDeidentify(col: OpenDataColumn) {
    if (!datasetId) return;
    const form = deidentifyForms[col.attributeId];
    if (!form || !form.method) return;
    if (form.method === "CUSTOM" && !form.notes.trim()) return;

    setDeidentifyForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], saving: true } }));
    try {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/deidentify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributeId: col.attributeId,
          method:      form.method,
          notes:       form.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "Failed to save de-identification method.");
        return;
      }
      onColumnUpdated({
        ...col,
        deidentificationMethod: form.method,
        deidentificationNotes:  form.notes.trim() || null,
      });
      setDeidentifyForms((p) => ({ ...p, [col.attributeId]: { open: false, method: form.method, notes: form.notes.trim(), saving: false } }));
    } finally {
      setDeidentifyForms((p) => ({ ...p, [col.attributeId]: { ...p[col.attributeId], saving: false } }));
    }
  }

  async function clearDeidentify(col: OpenDataColumn) {
    if (!datasetId) return;
    await fetch(`/api/open-data/datasets/${datasetId}/deidentify?attributeId=${col.attributeId}`, { method: "DELETE" });
    onColumnUpdated({ ...col, deidentificationMethod: null, deidentificationNotes: null });
    setDeidentifyForms((p) => ({ ...p, [col.attributeId]: { open: false, method: "", notes: "", saving: false } }));
  }

  // ── DQ issue form helpers ──────────────────────────────────────────────────

  function openNewIssueForm(attributeId: number, prefillDimension = "") {
    setDqForms((p) => ({
      ...p,
      [attributeId]: { open: true, issueId: null, dimension: prefillDimension, text: "", severity: "WARNING" },
    }));
  }

  function openEditForm(attributeId: number, issue: OpenDataDqIssue) {
    setDqForms((p) => ({
      ...p,
      [attributeId]: {
        open:      true,
        issueId:   issue.issueId,
        dimension: issue.dimensionCode ?? "",
        text:      issue.issueText,
        severity:  issue.severityCode,
      },
    }));
  }

  function closeForm(attributeId: number) {
    setDqForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], open: false, issueId: null } }));
  }

  function updateFormField(attributeId: number, field: keyof DqIssueFormState, value: string) {
    setDqForms((p) => ({ ...p, [attributeId]: { ...p[attributeId], [field]: value } }));
  }

  async function submitDqIssue(attributeId: number) {
    if (!datasetId) return;
    const form = dqForms[attributeId];
    if (!form?.text.trim()) return;

    const dim = dimensions.find((d) => d.code === form.dimension);

    if (form.issueId != null) {
      const res = await fetch(`/api/open-data/datasets/${datasetId}/dq-issues`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId:       form.issueId,
          dimensionCode: form.dimension || null,
          issueText:     form.text.trim(),
          severityCode:  form.severity,
        }),
      });
      if (!res.ok) return;
      const existing = dqIssues.find((i) => i.issueId === form.issueId);
      if (existing) {
        onDqIssueUpdated({
          ...existing,
          dimensionCode: form.dimension || null,
          dimensionName: dim?.name ?? null,
          issueText:     form.text.trim(),
          severityCode:  form.severity as "BLOCKER" | "WARNING" | "INFO",
        });
      }
    } else {
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
      onDqIssueAdded({
        issueId,
        datasetId:     datasetId!,
        attributeId,
        columnName:    selectedColumns.find((c) => c.attributeId === attributeId)?.physicalName ?? null,
        dimensionCode: form.dimension || null,
        dimensionName: dim?.name ?? null,
        issueText:     form.text.trim(),
        severityCode:  form.severity as "BLOCKER" | "WARNING" | "INFO",
        createdAt:     new Date().toISOString(),
      });
    }

    closeForm(attributeId);
  }

  async function removeDqIssue(issueId: number) {
    if (!datasetId) return;
    await fetch(`/api/open-data/datasets/${datasetId}/dq-issues?issueId=${issueId}`, { method: "DELETE" });
    onDqIssueRemoved(issueId);
  }

  // ── Severity colour helper ─────────────────────────────────────────────────

  const severityColors = {
    BLOCKER: "text-red-600 bg-red-50",
    WARNING: "text-amber-600 bg-amber-50",
    INFO:    "text-slate-500 bg-slate-100",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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

          {/* Direct-identifier add error */}
          {addError && (
            <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-red-500 text-sm shrink-0">⛔</span>
              <p className="text-xs text-red-700 font-medium">{addError}</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm max-h-72 overflow-y-auto">
              {results.map((col) => {
                const already      = selectedAttrIds.has(col.attributeId);
                const restricted   = isRestricted(col.classTermClassCode);
                const unclassified = !col.classTermClassCode;
                const isDirectId   = col.classTermPiCategoryCode === DIRECT_ID_CATEGORY;
                const isPiiOther   = col.classTermIsPii && !isDirectId;
                return (
                  <div
                    key={col.attributeId}
                    className={`flex items-center justify-between px-3 py-2.5 border-b border-slate-100 last:border-0 ${isDirectId ? "bg-red-50/50" : "hover:bg-slate-50"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-slate-800">{col.physicalName}</span>
                        <span className="text-xs text-slate-400">{col.dataType}</span>
                        {isDirectId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold border border-red-300">
                            ⛔ Direct Identifier — cannot include
                          </span>
                        )}
                        {isPiiOther && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium border border-purple-200">
                            PII — de-id required
                          </span>
                        )}
                        {!col.classTermIsPii && restricted && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium border border-orange-200">
                            Needs re-classification
                          </span>
                        )}
                        {!col.classTermIsPii && !restricted && unclassified && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium border border-yellow-200">
                            Not classified
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {col.sourceName} › {col.schemaName} › {col.entityName}
                      </div>
                      {col.classTermName && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <ClassificationTag code={col.classTermClassCode} />
                          <span className="text-xs text-slate-500">{col.classTermName}</span>
                        </div>
                      )}
                    </div>
                    {isDirectId ? (
                      <span className="ml-3 shrink-0 px-3 py-1 text-xs rounded-lg font-medium bg-red-100 text-red-400 cursor-not-allowed">
                        Cannot Add
                      </span>
                    ) : (
                      <button
                        onClick={() => !already && addColumn(col)}
                        disabled={already || adding === col.attributeId}
                        className={`ml-3 shrink-0 px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                          already
                            ? "bg-slate-100 text-slate-400 cursor-default"
                            : isPiiOther
                            ? "bg-purple-600 text-white hover:bg-purple-700"
                            : restricted
                            ? "bg-orange-500 text-white hover:bg-orange-600"
                            : unclassified
                            ? "bg-yellow-500 text-white hover:bg-yellow-600"
                            : "bg-brand-purple text-white hover:bg-brand-purple/90"
                        }`}
                      >
                        {already
                          ? "Added"
                          : adding === col.attributeId
                          ? "…"
                          : isPiiOther
                          ? "Add + De-identify"
                          : restricted
                          ? "Add + Re-classify"
                          : unclassified
                          ? "Add + Classify"
                          : "Add"}
                      </button>
                    )}
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
            const colIssues        = dqIssues.filter((i) => i.attributeId === col.attributeId);
            const rules            = dqRules[col.attributeId];
            const loadingRules     = rulesLoading[col.attributeId];
            const dqForm           = dqForms[col.attributeId];
            const reclassForm      = reclassifyForms[col.attributeId];
            const deidentForm      = deidentifyForms[col.attributeId];
            const needsReclass     = isRestricted(col.classTermCode) && !col.reclassificationRequestId;
            const needsClassification = !col.classTermCode && !col.reclassificationRequestId;
            const reclassPending   = !!col.reclassificationRequestId;
            const isDirectIdCol    = col.classTermPiCategory === DIRECT_ID_CATEGORY;
            const isPiiCol         = col.classTermIsPii && !isDirectIdCol;
            const needsDeident     = isPiiCol && !col.deidentificationMethod;
            const hasDeident       = isPiiCol && !!col.deidentificationMethod;

            return (
              <div
                key={col.odColumnId}
                className={`border rounded-xl bg-white overflow-hidden ${
                  isDirectIdCol     ? "border-red-400"
                  : needsReclass    ? "border-orange-300"
                  : needsClassification ? "border-yellow-300"
                  : needsDeident    ? "border-purple-300"
                  : "border-slate-200"
                }`}
              >
                {/* ── Direct identifier hard block banner ── */}
                {isDirectIdCol && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 border-b border-red-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-red-600 text-sm">⛔</span>
                      <p className="text-xs text-red-800 font-medium">
                        This column is a <strong>direct identifier</strong> (national ID, SIN, phone number, full name, etc.)
                        and cannot be included in open data. Remove it before submitting.
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => removeColumn(col)}
                        className="shrink-0 text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}

                {/* ── De-identification required banner ── */}
                {needsDeident && !isDirectIdCol && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2 bg-purple-50 border-b border-purple-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-purple-500 text-sm">🔒</span>
                      <p className="text-xs text-purple-800 font-medium">
                        This column contains PII and must have a de-identification method selected before submission.
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => openDeidentifyForm(col.attributeId)}
                        className="shrink-0 text-xs px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                      >
                        Set De-identification
                      </button>
                    )}
                  </div>
                )}

                {/* ── De-identification applied indicator ── */}
                {hasDeident && (
                  <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-purple-50 border-b border-purple-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-purple-500 text-xs">✓</span>
                      <p className="text-xs text-purple-800">
                        De-identified: <strong>{DEIDENT_METHOD_LABELS[col.deidentificationMethod!] ?? col.deidentificationMethod}</strong>
                        {col.deidentificationNotes && (
                          <span className="ml-1 text-purple-600">— {col.deidentificationNotes}</span>
                        )}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openDeidentifyForm(col.attributeId, col.deidentificationMethod, col.deidentificationNotes)}
                          className="text-[10px] px-2 py-0.5 border border-purple-200 rounded text-purple-600 hover:bg-purple-100 transition-colors"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => clearDeidentify(col)}
                          className="text-[10px] px-2 py-0.5 border border-red-100 rounded text-red-400 hover:bg-red-50 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Classification required banner (unclassified column) ── */}
                {needsClassification && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-yellow-500 text-sm">⚠</span>
                      <p className="text-xs text-yellow-800 font-medium">
                        This column has no classification. It must be assigned a public classification before
                        this dataset can be submitted for approval.
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => openReclassifyForm(col.attributeId)}
                        className="shrink-0 text-xs px-3 py-1 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium"
                      >
                        Assign Classification
                      </button>
                    )}
                  </div>
                )}

                {/* ── Re-classification required banner ── */}
                {needsReclass && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2 bg-orange-50 border-b border-orange-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-orange-500 text-sm">⚠</span>
                      <p className="text-xs text-orange-800 font-medium">
                        This column is classified as <strong>{col.classTermCode}</strong> and must be
                        re-classified as Public before this dataset can be submitted for approval.
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => openReclassifyForm(col.attributeId)}
                        className="shrink-0 text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                      >
                        Re-classify as Public
                      </button>
                    )}
                  </div>
                )}

                {/* ── Re-classification pending indicator ── */}
                {reclassPending && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-100">
                    <span className="text-amber-500 text-xs">⏳</span>
                    <p className="text-xs text-amber-800">
                      Re-classification pending approval (request #{col.reclassificationRequestId}).
                      {col.reclassificationReason && (
                        <span className="ml-1 text-amber-600">Reason: {col.reclassificationReason}</span>
                      )}
                    </p>
                  </div>
                )}

                {/* ── Column header ── */}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800">{col.physicalName}</span>
                      <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{col.dataType}</span>
                      {col.classTermCode && <ClassificationTag code={col.classTermCode} />}
                      {isDirectIdCol && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold border border-red-200">
                          Direct Identifier
                        </span>
                      )}
                      {isPiiCol && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium border border-purple-200">PII</span>
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
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {col.dqRuleCount > 0 && rules === undefined && !loadingRules && (
                      <button
                        onClick={() => fetchDqRules(col.attributeId)}
                        className="text-xs px-2.5 py-1 border border-sky-200 rounded-lg text-sky-600 hover:bg-sky-50 transition-colors"
                      >
                        {col.dqRuleCount} DQ rule{col.dqRuleCount > 1 ? "s" : ""} ↓
                      </button>
                    )}
                    {loadingRules && (
                      <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
                    )}
                    {canEdit && (
                      <>
                        <button
                          onClick={() => openNewIssueForm(col.attributeId)}
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
                      </>
                    )}
                  </div>
                </div>

                {/* ── De-identification form ── */}
                {deidentForm?.open && (
                  <div className="border-t border-purple-200 bg-purple-50 px-4 py-3 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-purple-900 mb-1">De-identification Method</p>
                      <p className="text-[11px] leading-relaxed text-purple-700">
                        This column contains PII. Select how it will be de-identified before publication.
                        The chosen method will be reviewed by a Data Protection Officer as part of the approval process.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-medium text-purple-900 mb-1">
                          Method <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={deidentForm.method}
                          onChange={(e) => updateDeidentifyField(col.attributeId, "method", e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                        >
                          <option value="">— Select a de-identification method —</option>
                          {Object.entries(DEIDENT_METHOD_LABELS).map(([code, label]) => (
                            <option key={code} value={code}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {deidentForm.method === "CUSTOM" && (
                        <div>
                          <label className="block text-[11px] font-medium text-purple-900 mb-1">
                            Description <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={deidentForm.notes}
                            onChange={(e) => updateDeidentifyField(col.attributeId, "notes", e.target.value)}
                            placeholder="Describe the custom de-identification method that will be applied…"
                            rows={2}
                            className="w-full px-2 py-1.5 text-xs border border-purple-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-purple-300"
                          />
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => submitDeidentify(col)}
                          disabled={!deidentForm.method || (deidentForm.method === "CUSTOM" && !deidentForm.notes.trim()) || deidentForm.saving}
                          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
                        >
                          {deidentForm.saving ? "Saving…" : "Save De-identification Method"}
                        </button>
                        <button
                          onClick={() => closeDeidentifyForm(col.attributeId)}
                          disabled={deidentForm.saving}
                          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Classify / Re-classify form ── */}
                {reclassForm?.open && (
                  <div className={`border-t px-4 py-3 space-y-3 ${col.classTermCode ? "border-orange-200 bg-orange-50" : "border-yellow-200 bg-yellow-50"}`}>
                    <div>
                      <p className={`text-xs font-semibold mb-1 ${col.classTermCode ? "text-orange-800" : "text-yellow-800"}`}>
                        {col.classTermCode ? "Re-classify for Open Data Publication" : "Assign Classification for Open Data Publication"}
                      </p>
                      <p className={`text-[11px] leading-relaxed ${col.classTermCode ? "text-orange-700" : "text-yellow-700"}`}>
                        {col.classTermCode
                          ? <>The selected term is classified as <strong>{col.classTermCode}</strong>. Choose a public-level classification term and provide a justification. A re-classification request will be created and must be approved. The reason will be recorded in the term's audit history.</>
                          : "This column has no classification. Select a public-level classification term and provide a reason. A classification request will be submitted for approval."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[11px] font-medium text-orange-800 mb-1">
                          Target classification term <span className="text-red-500">*</span>
                        </label>
                        {termsLoading ? (
                          <p className="text-xs text-slate-400 animate-pulse">Loading available terms…</p>
                        ) : (
                          <select
                            value={reclassForm.termId}
                            onChange={(e) => updateReclassifyField(col.attributeId, "termId", e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-300"
                          >
                            <option value="">— Select a public classification term —</option>
                            {(publicTerms ?? []).map((t) => (
                              <option key={t.glossaryId} value={String(t.glossaryId)}>
                                {t.termName}
                                {t.classificationCode ? ` (${t.classificationCode})` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-orange-800 mb-1">
                          Reason for re-classification <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={reclassForm.reason}
                          onChange={(e) => updateReclassifyField(col.attributeId, "reason", e.target.value)}
                          placeholder="Explain why this column can be published as open data and should be re-classified as public…"
                          rows={3}
                          className="w-full px-2 py-1.5 text-xs border border-orange-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-orange-300"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => submitReclassify(col)}
                          disabled={!reclassForm.termId || !reclassForm.reason.trim() || reclassForm.saving}
                          className={`px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50 font-medium transition-colors ${col.classTermCode ? "bg-orange-500 hover:bg-orange-600" : "bg-yellow-500 hover:bg-yellow-600"}`}
                        >
                          {reclassForm.saving ? "Submitting…" : col.classTermCode ? "Submit Re-classification Request" : "Submit Classification Request"}
                        </button>
                        <button
                          onClick={() => closeReclassifyForm(col.attributeId)}
                          disabled={reclassForm.saving}
                          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── DQ Rules from catalog ── */}
                {rules && rules.length > 0 && (
                  <div className="border-t border-sky-100 bg-sky-50/50 px-4 py-2.5">
                    <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide mb-2">
                      DQ Rules ({rules.length})
                    </p>
                    <div className="space-y-1.5">
                      {rules.map((rule) => (
                        <div key={rule.ruleId} className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-slate-700">{rule.ruleName}</span>
                              {rule.dimensionName && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  {rule.dimensionName}
                                </span>
                              )}
                              {rule.severity && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  rule.severity === "BLOCKER" ? "bg-red-100 text-red-600"
                                  : rule.severity === "WARNING" ? "bg-amber-100 text-amber-600"
                                  : "bg-slate-100 text-slate-500"
                                }`}>
                                  {rule.severity}
                                </span>
                              )}
                            </div>
                            {rule.lastRunAt && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Last run: {rule.lastRunAt}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <RuleStatusBadge status={rule.lastStatus} score={rule.lastScore} />
                            {canEdit && (
                              <button
                                onClick={() => openNewIssueForm(col.attributeId, rule.dimensionCode ?? "")}
                                className="text-[10px] px-2 py-0.5 border border-amber-200 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                              >
                                Add Issue
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {rules && rules.length === 0 && col.dqRuleCount === 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
                    <p className="text-xs text-slate-400">No active DQ rules linked to this column.</p>
                  </div>
                )}

                {/* ── Existing DQ issues (from dataset context) ── */}
                {colIssues.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      DQ Issue Notes ({colIssues.length})
                    </p>
                    {colIssues.map((issue) => (
                      <div key={issue.issueId} className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {issue.dimensionName && (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {issue.dimensionName}
                              </span>
                            )}
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${severityColors[issue.severityCode]}`}>
                              {issue.severityCode}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-0.5">{issue.issueText}</p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => openEditForm(col.attributeId, issue)}
                              className="text-xs text-sky-500 hover:text-sky-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeDqIssue(issue.issueId)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── DQ issue add / edit form ── */}
                {dqForm?.open && (
                  <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 space-y-2">
                    <p className="text-xs font-medium text-amber-700">
                      {dqForm.issueId != null ? "Edit DQ Issue Note" : "Add DQ Issue Note"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={dqForm.dimension}
                        onChange={(e) => updateFormField(col.attributeId, "dimension", e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="">— DQ Dimension (optional) —</option>
                        {dimensions.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                      <select
                        value={dqForm.severity}
                        onChange={(e) => updateFormField(col.attributeId, "severity", e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="INFO">Info</option>
                        <option value="WARNING">Warning</option>
                        <option value="BLOCKER">Blocker</option>
                      </select>
                    </div>
                    <textarea
                      value={dqForm.text}
                      onChange={(e) => updateFormField(col.attributeId, "text", e.target.value)}
                      placeholder="Describe the data quality issue in the context of this dataset…"
                      rows={2}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitDqIssue(col.attributeId)}
                        disabled={!dqForm.text.trim()}
                        className="px-3 py-1 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                      >
                        {dqForm.issueId != null ? "Save Changes" : "Save Issue"}
                      </button>
                      <button
                        onClick={() => closeForm(col.attributeId)}
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
