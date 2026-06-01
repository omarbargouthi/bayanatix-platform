"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/lang-context";
import type { RetentionOverview } from "@/lib/types";

function StatCard({ label, value, sub, color = "text-brand-purple" }: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-[11px] text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted">{sub}</span>}
    </div>
  );
}

function PctBar({ label, value, max, color }: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 truncate text-muted" title={label}>{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-medium text-ink">{value}</span>
    </div>
  );
}

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC:       "bg-green-400",
  INTERNAL:     "bg-blue-400",
  CONFIDENTIAL: "bg-amber-400",
  RESTRICTED:   "bg-red-400",
  SECRET:       "bg-purple-500",
  TOP_SECRET:   "bg-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   "bg-blue-400",
  RETAINED: "bg-green-400",
  EXPIRED:  "bg-amber-400",
  PURGED:   "bg-gray-400",
  ARCHIVED: "bg-sky-400",
  ON_HOLD:  "bg-red-400",
};

export function RetentionOverviewTab() {
  const { t } = useLang();
  const r = t.retention;
  const [data, setData] = useState<RetentionOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/retention/overview")
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand-purple border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return null;

  const coveragePct = data.entitiesTotal > 0
    ? Math.round((data.entitiesClassified / data.entitiesTotal) * 100)
    : 0;
  const maxSensitivity = Math.max(1, ...data.bySensitivity.map((s) => s.count));
  const maxStatus = Math.max(1, ...data.byStatus.map((s) => s.count));

  const sensitivityLabel: Record<string, string> = {
    PUBLIC:       r.sensitivityPublic,
    INTERNAL:     r.sensitivityInternal,
    CONFIDENTIAL: r.sensitivityConfidential,
    RESTRICTED:   r.sensitivityRestricted,
    SECRET:       r.sensitivitySecret,
    TOP_SECRET:   r.sensitivityTopSecret,
  };

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={r.totalCategories} value={data.totalCategories} />
        <StatCard label={r.totalSchedules}  value={data.totalSchedules} />
        <StatCard label={r.activeHolds}     value={data.activeHolds}     color={data.activeHolds > 0 ? "text-red-500" : "text-brand-purple"} />
        <StatCard
          label={r.classified}
          value={`${coveragePct}%`}
          sub={`${data.entitiesClassified} / ${data.entitiesTotal} entities`}
          color={coveragePct >= 80 ? "text-emerald-600" : coveragePct >= 50 ? "text-amber-500" : "text-red-500"}
        />
      </div>

      {/* Alert row */}
      {(data.expiringSoon > 0 || data.overdue > 0) && (
        <div className="flex gap-3">
          {data.overdue > 0 && (
            <div className="flex-1 rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="text-[12px] font-semibold text-red-700">{data.overdue} {r.overdue}</div>
                <div className="text-[11px] text-red-500">Retention period exceeded — action required</div>
              </div>
            </div>
          )}
          {data.expiringSoon > 0 && (
            <div className="flex-1 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
              <span className="text-lg">🕐</span>
              <div>
                <div className="text-[12px] font-semibold text-amber-700">{data.expiringSoon} {r.expiringSoon}</div>
                <div className="text-[11px] text-amber-500">Within 90 days</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Distribution panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Classification coverage */}
        <div className="card p-4">
          <h3 className="text-[13px] font-semibold text-ink mb-3">{r.coverageTitle}</h3>
          <div className="flex items-center justify-center mb-3">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={coveragePct >= 80 ? "#10b981" : coveragePct >= 50 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="3"
                  strokeDasharray={`${coveragePct} ${100 - coveragePct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-ink">{coveragePct}%</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 text-center text-[11px]">
            <div className="p-2 bg-green-50 rounded-lg">
              <div className="font-bold text-green-700">{data.entitiesClassified}</div>
              <div className="text-muted">{r.classified}</div>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              <div className="font-bold text-gray-500">{data.entitiesTotal - data.entitiesClassified}</div>
              <div className="text-muted">{r.unclassified}</div>
            </div>
          </div>
        </div>

        {/* By sensitivity */}
        <div className="card p-4">
          <h3 className="text-[13px] font-semibold text-ink mb-3">{r.sensitivityDist}</h3>
          {data.bySensitivity.length === 0 ? (
            <p className="text-[12px] text-muted italic">{t.common.noData}</p>
          ) : (
            <div className="space-y-2">
              {data.bySensitivity.map((s) => (
                <PctBar
                  key={s.sensitivity}
                  label={sensitivityLabel[s.sensitivity] ?? s.sensitivity}
                  value={s.count}
                  max={maxSensitivity}
                  color={SENSITIVITY_COLORS[s.sensitivity] ?? "bg-gray-400"}
                />
              ))}
            </div>
          )}
        </div>

        {/* By retention status */}
        <div className="card p-4 md:col-span-2">
          <h3 className="text-[13px] font-semibold text-ink mb-3">{r.retentionStatusDist}</h3>
          {data.byStatus.length === 0 ? (
            <p className="text-[12px] text-muted italic">{t.common.noData}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.byStatus.map((s) => (
                <div key={s.status} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[s.status] ?? "bg-gray-400"}`} />
                  <span className="text-[11px] text-ink flex-1 capitalize">{s.status.toLowerCase().replace("_", " ")}</span>
                  <span className="text-[12px] font-bold text-ink">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
