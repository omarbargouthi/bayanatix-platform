"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { FollowedActivityItem } from "@/lib/queries/follows";

const ASSET_LABEL: Record<string, string> = {
  DATA_SOURCES: "Source", DATA_SCHEMAS: "Schema", DATA_ENTITIES: "Table", DATA_ATTRIBUTES: "Column",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FollowedActivityWidget({ items }: { items: FollowedActivityItem[] }) {
  const { t } = useLang();
  const h = t.homepage;

  if (items.length === 0) return <p className="text-[12px] text-muted">{h.followedActivity.empty}</p>;

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.auditId} className="text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              item.action === "CREATE" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            }`}>
              {item.action === "CREATE" ? "New" : "Updated"}
            </span>
            <span className="text-[10px] text-muted uppercase tracking-wide shrink-0">
              {ASSET_LABEL[item.assetType] ?? item.assetType}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {item.href ? (
              <Link href={item.href} className="font-medium text-ink hover:text-brand-purple hover:underline truncate">
                {item.assetName ?? `#${item.assetId}`}
              </Link>
            ) : (
              <span className="font-medium text-ink truncate">{item.assetName ?? `#${item.assetId}`}</span>
            )}
            <span className="text-muted text-[10px] shrink-0">{timeAgo(item.timestamp)}</span>
          </div>
          <div className="text-[10px] text-muted mt-0.5 truncate">
            {item.actorName ?? item.actorUserId} · following {item.followedName ?? `#${item.followedId}`}
          </div>
        </li>
      ))}
    </ul>
  );
}
