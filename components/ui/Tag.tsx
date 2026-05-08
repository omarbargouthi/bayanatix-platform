import { cn } from "@/lib/utils";

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

// Map common cert codes to tag variants
export function CertTag({ code }: { code?: string | null }) {
  if (!code) return <Tag>Uncertified</Tag>;
  const c = code.toUpperCase();
  if (c === "GOLD")   return <Tag variant="green">Gold</Tag>;
  if (c === "SILVER") return <Tag variant="amber">Silver</Tag>;
  if (c === "BRONZE") return <Tag variant="red">Bronze</Tag>;
  return <Tag>{c}</Tag>;
}

export function ClassificationTag({ code }: { code?: string | null }) {
  if (!code) return <Tag>—</Tag>;
  const c = code.toUpperCase();
  if (c === "PUBLIC")     return <Tag>Public</Tag>;
  if (c === "RESTRICTED") return <Tag variant="amber">Restricted</Tag>;
  if (c === "PII")        return <Tag variant="red">PII · Masked</Tag>;
  if (c === "SECRET")     return <Tag variant="red">Secret</Tag>;
  return <Tag>{c}</Tag>;
}
