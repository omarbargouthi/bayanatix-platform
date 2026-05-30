"use client";

import { cn } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";

type Variant = "default" | "green" | "amber" | "red" | "blue" | "purple";

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
  };
  return <span className={cn(map[variant], className)}>{children}</span>;
}

export function CertTag({ code }: { code?: string | null }) {
  const { t } = useLang();
  const c = t.catalog;
  if (!code) return <Tag>{c.certUncertified}</Tag>;
  const upper = code.toUpperCase();
  if (upper === "GOLD")   return <Tag variant="green">{c.certGold}</Tag>;
  if (upper === "SILVER") return <Tag variant="amber">{c.certSilver}</Tag>;
  if (upper === "BRONZE") return <Tag variant="red">{c.certBronze}</Tag>;
  return <Tag>{upper}</Tag>;
}

export function ClassificationTag({ code }: { code?: string | null }) {
  const { t } = useLang();
  const c = t.catalog;
  if (!code) return <Tag>—</Tag>;
  const upper = code.toUpperCase();
  if (upper === "PUBLIC")     return <Tag>{c.classPublic}</Tag>;
  if (upper === "INTERNAL")   return <Tag>{c.classInternal}</Tag>;
  if (upper === "CONFIDENTIAL") return <Tag variant="amber">{c.classConfidential}</Tag>;
  if (upper === "RESTRICTED") return <Tag variant="amber">{c.classRestricted}</Tag>;
  if (upper === "PII")        return <Tag variant="red">{c.classPii}</Tag>;
  if (upper === "SECRET")     return <Tag variant="red">{c.classSecret}</Tag>;
  if (upper === "TOP_SECRET") return <Tag variant="red">{c.classTopSecret}</Tag>;
  return <Tag>{upper}</Tag>;
}
