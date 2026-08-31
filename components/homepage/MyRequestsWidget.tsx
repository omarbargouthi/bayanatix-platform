"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { timeAgo } from "./WidgetShell";
import type { MyRequestsSummary } from "@/lib/queries/homepage";

const PRIORITY_DOT: Record<string, string> = { HIGH: "bg-red-500", MEDIUM: "bg-amber-400", LOW: "bg-gray-300" };

export function MyRequestsWidget({ summary }: { summary: MyRequestsSummary }) {
  const { t } = useLang();
  const h = t.homepage;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-semibold text-brand-purple">{h.myRequests.openCount.replace("{n}", String(summary.openCount))}</span>
        <Link href="/requests" className="text-[11px] text-muted hover:text-brand-purple hover:underline">{h.myRequests.viewAll}</Link>
      </div>
      {summary.items.length === 0 ? (
        <p className="text-[12px] text-muted">{h.myRequests.empty}</p>
      ) : (
        <ul className="space-y-3">
          {summary.items.map((r) => (
            <li key={`${r.source}-${r.requestId}`} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[r.priorityCode] ?? "bg-gray-300"}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/requests?id=${r.requestId}`} className="text-[12px] font-medium text-ink hover:text-brand-purple hover:underline leading-snug line-clamp-1 block">
                  {r.title}
                </Link>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted">
                  <span>{r.source === "RAISED" ? h.myRequests.raisedByMe : h.myRequests.onMyAsset}</span>
                  <span>·</span>
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
