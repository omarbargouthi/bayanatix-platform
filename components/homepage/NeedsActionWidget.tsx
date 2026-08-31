"use client";

import Link from "next/link";
import type { Notification } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import { timeAgo } from "./WidgetShell";

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-blue-400", SUCCESS: "bg-emerald-400", WARNING: "bg-amber-400", ERROR: "bg-red-400",
};

export function NeedsActionWidget({ items }: { items: Notification[] }) {
  const { t } = useLang();
  const h = t.homepage;
  if (items.length === 0) return <p className="text-[12px] text-muted">{h.needsAction.empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((n) => (
        <li key={n.notificationId} className="flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[n.severity] ?? "bg-gray-300"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-ink leading-snug">{n.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
              {n.actionLabel && n.actionHref && (
                <Link href={n.actionHref} className="text-[11px] font-semibold text-brand-purple hover:underline">
                  {n.actionLabel}
                </Link>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
