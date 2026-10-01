"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/queries/reports";
import { formatValue } from "./KpiCard";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";

function monthLabel(periodMonth: string, locale: string): string {
  const d = new Date(periodMonth);
  return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
}

// Just the fields this chart actually needs, rather than the exact KpiCardData
// shape -- KpiCardData satisfies this directly; DomainScorecardCapability (which
// names these kpiName/kpiNameTranslations instead) adapts with a one-line object
// at its own call site.
type TrendKpi = { nameEn: string; nameTranslations: Record<string, string> | null; targetValue: number | null; format: "PERCENT" | "NUMBER" | "DAYS" };

// kpi identifies which KPI this trend belongs to -- this chart was previously
// unlabeled (no axis, no title saying which KPI or unit it plotted), which made
// it unreadable on its own. Now it shows the KPI's own name as the title and
// formats the axis/tooltip with that KPI's unit (%, days, plain number), same
// formatValue() KpiCard itself uses.
export function TrendChart({ data, kpi }: { data: TrendPoint[]; kpi?: TrendKpi | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, lang } = useLang();
  const rc = t.reports.common;
  const locale = lang !== "en" ? "ar" : "en-US";
  const target = kpi?.targetValue ?? null;
  const format = kpi?.format ?? "NUMBER";
  const title = kpi ? pickTranslation(kpi.nameEn, kpi.nameTranslations, lang) : rc.trend;

  if (data.length < 2) {
    return (
      <div>
        <div className="text-sm font-semibold text-ink mb-2">{title}</div>
        <div className="h-[150px] flex flex-col items-center justify-center text-muted text-sm gap-1">
          <span>{t.reports.common.noTrend}</span>
          <span className="text-xs">{t.reports.common.noTrendSub}</span>
        </div>
      </div>
    );
  }

  const W = 480, H = 160;
  const PAD = { l: 34, r: 14, t: 16, b: 24 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const values = data.map((d) => d.value);
  const yMin = Math.min(0, ...values, target ?? 0);
  const yMax = Math.max(format === "PERCENT" ? 100 : Math.max(...values), ...values, target ?? 0);
  const toY = (v: number) => PAD.t + cH - ((v - yMin) / (yMax - yMin || 1)) * cH;
  const toX = (i: number) => PAD.l + (data.length <= 1 ? cW / 2 : (i / (data.length - 1)) * cW);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.value)}`).join(" ");

  // 4 evenly-spaced gridlines from yMin to yMax, same "read the actual value off
  // the axis" convention as MaturityChart/ComplianceTrendChart elsewhere in Reports.
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((t2) => yMin + (yMax - yMin) * t2);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {target != null && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2.5 h-0 border-t border-dashed border-[#c0c4e0]" /> {rc.target}: {formatValue(target, format)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#eef0fb" strokeWidth="1" />
            <text x={PAD.l - 6} y={toY(v) + 3} textAnchor="end" fontSize="9" fill="#8089b3">{formatValue(Math.round(v), format)}</text>
          </g>
        ))}
        {target != null && (
          <line x1={PAD.l} x2={W - PAD.r} y1={toY(target)} y2={toY(target)} stroke="#c0c4e0" strokeWidth="1" strokeDasharray="4 3" />
        )}
        <path d={path} fill="none" stroke="#6058A0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle
            key={d.periodMonth}
            cx={toX(i)} cy={toY(d.value)}
            r={hover === i ? 5 : 3}
            fill="#6058A0"
            stroke={hover === i ? "white" : "none"}
            strokeWidth={hover === i ? 1.5 : 0}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover != null && (
          <g>
            <rect x={Math.min(Math.max(toX(hover) - 30, PAD.l), W - PAD.r - 60)} y={Math.max(toY(data[hover].value) - 30, PAD.t)} width="60" height="22" rx="4" fill="white" stroke="#dde0f0" />
            <text x={Math.min(Math.max(toX(hover), PAD.l + 30), W - PAD.r - 30)} y={Math.max(toY(data[hover].value) - 15, PAD.t + 15)} textAnchor="middle" fontSize="9" fill="#50568a" fontWeight="600">
              {monthLabel(data[hover].periodMonth, locale)}: {formatValue(data[hover].value, format)}
            </text>
          </g>
        )}
        {data.map((d, i) => (
          <text key={d.periodMonth} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#8089b3">
            {monthLabel(d.periodMonth, locale)}
          </text>
        ))}
      </svg>
    </div>
  );
}
