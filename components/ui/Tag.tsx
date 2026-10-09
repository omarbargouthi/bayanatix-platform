"use client";

import { cn } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";

type Variant = "default" | "green" | "amber" | "red" | "blue" | "purple" | "gold" | "gray" | "orange";

export function Tag({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const map: Record<Variant, string> = {
    default: "tag",
    green: "tag tag-green",
    amber: "tag tag-amber",
    red: "tag tag-red",
    blue: "tag tag-blue",
    purple: "tag tag-purple",
    gold: "tag tag-gold",
    gray: "tag tag-gray",
    orange: "tag tag-orange",
  };
  return <span className={cn(map[variant], className)}>{children}</span>;
}

// Small medal icon marking a tag as a certification badge (vs. a plain label).
function CertBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

export function CertTag({ code }: { code?: string | null }) {
  const { t } = useLang();
  const c = t.catalog;
  if (!code) return <Tag>{c.certUncertified}</Tag>;
  const upper = code.toUpperCase();
  if (upper === "GOLD")   return <Tag variant="gold"><CertBadgeIcon />{c.certGold}</Tag>;
  if (upper === "SILVER") return <Tag variant="gray"><CertBadgeIcon />{c.certSilver}</Tag>;
  if (upper === "BRONZE") return <Tag variant="orange"><CertBadgeIcon />{c.certBronze}</Tag>;
  return <Tag>{upper}</Tag>;
}

// Compact certification badge for page headers: one pill per kind (metadata / data).
// Uncertified shows as a dimmed pill rather than spelling the word out; the full
// status is in the tooltip.
export function CertBadge({ code, kind }: { code?: string | null; kind: "metadata" | "data" }) {
  const { t } = useLang();
  const c = t.catalog;
  const label = kind === "metadata" ? c.certMetadataShort : c.certDataShort;
  const upper = code?.toUpperCase();
  const level = upper === "GOLD" ? c.certGold : upper === "SILVER" ? c.certSilver : upper === "BRONZE" ? c.certBronze : null;
  if (!level) {
    return (
      <span title={`${label}: ${upper ?? c.certUncertified}`} className="tag border-dashed font-medium opacity-50">
        <CertBadgeIcon />{label}
      </span>
    );
  }
  const variant: Variant = upper === "GOLD" ? "gold" : upper === "SILVER" ? "gray" : "orange";
  return <span title={`${label}: ${level}`}><Tag variant={variant}><CertBadgeIcon />{label} · {level}</Tag></span>;
}

const CLASSIFICATION_VARIANT: Record<string, Variant> = {
  CONFIDENTIAL: "amber",
  RESTRICTED:   "amber",
  PII:          "red",
  SECRET:       "red",
  TOP_SECRET:   "red",
};

export function ClassificationTag({ code }: { code?: string | null }) {
  const { lookupLabel } = useLang();
  if (!code) return <Tag>—</Tag>;
  const upper = code.toUpperCase();
  return (
    <Tag variant={CLASSIFICATION_VARIANT[upper] ?? "default"}>
      {lookupLabel("CLASSIFICATION", upper)}
    </Tag>
  );
}

// System-managed status badge for a table/column a rescan no longer found at
// the source — soft-deleted (see db/117), not a free-form user tag, so it
// can't be accidentally removed or duplicated. Renders nothing when active.
export function LifecycleBadge({ status, deprecatedAt }: { status?: string | null; deprecatedAt?: string | null }) {
  const { t } = useLang();
  const c = t.catalog;
  if (status !== "DEPRECATED") return null;
  const dateSuffix = deprecatedAt
    ? c.deprecatedAtSuffix.replace("{date}", new Date(deprecatedAt).toLocaleDateString())
    : "";
  return <Tag variant="red">{c.deprecatedBadge}{dateSuffix}</Tag>;
}
