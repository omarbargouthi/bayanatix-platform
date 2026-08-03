export type RagStatus = "green" | "amber" | "red";

/**
 * Direction-aware RAG comparison of a KPI's current value against its target.
 * UP  = higher is better (e.g. coverage %) — green once value >= target.
 * DOWN = lower is better (e.g. open issues) — green once value <= target.
 * Values within a 10% band of the target are amber rather than red; DOWN-direction
 * KPIs commonly target 0 (open issues), where a percentage band is meaningless, so
 * a small absolute band is used instead.
 */
export function getRagStatus(
  value: number | null | undefined,
  target: number | null | undefined,
  direction: "UP" | "DOWN" = "UP",
): RagStatus {
  if (value == null || target == null) return "amber";

  const meetsTarget = direction === "UP" ? value >= target : value <= target;
  if (meetsTarget) return "green";

  const band = target !== 0 ? Math.abs(target) * 0.1 : 3;
  const withinBand = direction === "UP" ? value >= target - band : value <= target + band;

  return withinBand ? "amber" : "red";
}

export const RAG_CLASSES: Record<RagStatus, { bg: string; text: string; border: string; badge: string }> = {
  green: { bg: "bg-emerald-50/50", text: "text-emerald-600", border: "border-l-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
  amber: { bg: "bg-amber-50/50",   text: "text-amber-600",   border: "border-l-amber-400",   badge: "bg-amber-100 text-amber-700" },
  red:   { bg: "bg-red-50/50",     text: "text-red-600",     border: "border-l-red-400",     badge: "bg-red-100 text-red-700" },
};
