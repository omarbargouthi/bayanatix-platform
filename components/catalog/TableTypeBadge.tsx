"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang-context";
import { Tag } from "@/components/ui/Tag";

const CATEGORY_OPTIONS = [
  { value: "MASTER",        labelKey: "typeMaster" as const },
  { value: "TRANSACTIONAL", labelKey: "typeTransactional" as const },
  { value: "REFERENCE",     labelKey: "typeReference" as const },
  { value: "SETUP",         labelKey: "typeSetup" as const },
  { value: "SYSTEM",        labelKey: "typeSystem" as const },
];

// Shows the table type as a plain tag once a steward has reviewed it (or it was
// set by hand before this feature existed). Until then, the crawler's suggestion
// is shown as a distinct dashed/amber badge with Accept / Change actions — the
// suggestion never silently becomes "the" type without a steward looking at it.
export function TableTypeBadge({
  entityId, category, categoryConfidence, categoryIsConfirmed, canEdit,
}: {
  entityId: number;
  category: string | null;
  categoryConfidence?: "HIGH" | "MEDIUM" | "LOW" | null;
  categoryIsConfirmed?: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { t } = useLang();
  const c = t.catalog;
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  const labelFor = (code: string | null) => {
    const opt = CATEGORY_OPTIONS.find(o => o.value === code);
    return opt ? c[opt.labelKey] : code;
  };

  async function confirm(newCategory: string | null) {
    setBusy(true);
    try {
      await fetch(`/api/catalog/entities/${entityId}/confirm-category`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory }),
      });
      setChanging(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (!category) return null;

  if (categoryIsConfirmed) {
    return <Tag variant="purple">{labelFor(category)}</Tag>;
  }

  const confidenceLabel = categoryConfidence === "HIGH" ? c.confidenceHigh
    : categoryConfidence === "MEDIUM" ? c.confidenceMedium : c.confidenceLow;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-dashed border-amber-400 bg-amber-50 text-amber-700"
        title={`${c.suggestedTypeTitle} (${confidenceLabel})`}
      >
        {c.suggestedTypePrefix} {labelFor(category)}
      </span>
      {canEdit && !changing && (
        <>
          <button
            onClick={() => confirm(category)}
            disabled={busy}
            className="text-[11px] font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            {c.acceptSuggestion}
          </button>
          <button
            onClick={() => setChanging(true)}
            className="text-[11px] font-medium text-muted hover:text-ink hover:underline"
          >
            {c.changeSuggestion}
          </button>
        </>
      )}
      {canEdit && changing && (
        <select
          autoFocus
          disabled={busy}
          defaultValue={category}
          onChange={(e) => confirm(e.target.value || null)}
          onBlur={() => setChanging(false)}
          className="text-xs border border-line rounded px-1.5 py-0.5 bg-white focus:outline-none focus:border-brand-purple"
        >
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{c[o.labelKey]}</option>)}
        </select>
      )}
    </span>
  );
}
