"use client";

// One name per data quality dimension everywhere: the name kept in Configuration › DQ
// Dimensions, in the reader's language (translated in Languages & Translations).
// Screens must not keep their own labels for dimensions (the CDE card once said
// "Timeliness" for what everywhere else is "Freshness").
import { useLang } from "./lang-context";

export function useDqDimensionLabel(): (code: string | null | undefined, fallback?: string | null) => string {
  const { lookupLabel } = useLang();
  return (code, fallback) => {
    if (!code) return fallback ?? "";
    const label = lookupLabel("DQ_DIMENSION", code);
    return label && label !== code ? label : (fallback || code);
  };
}

/** For server-rendered pages. */
export function DqDimensionName({ code, fallback }: { code: string; fallback?: string | null }) {
  return <>{useDqDimensionLabel()(code, fallback)}</>;
}
