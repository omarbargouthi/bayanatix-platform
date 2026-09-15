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
