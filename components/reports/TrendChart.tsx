"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/queries/reports";
import { useLang } from "@/lib/lang-context";

function monthLabel(periodMonth: string, locale: string): string {
  const d = new Date(periodMonth);
  return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
}

export function TrendChart({ data, target }: { data: TrendPoint[]; target?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const { t, lang } = useLang();
  const locale = lang !== "en" ? "ar" : "en-US";

  if (data.length < 2) {
    return (
      <div className="h-[150px] flex flex-col items-center justify-center text-muted text-sm gap-1">
        <span>{t.reports.common.noTrend}</span>
        <span className="text-xs">{t.reports.common.noTrendSub}</span>
      </div>
    );
  }

  const W = 480, H = 160;
  const PAD = { l: 28, r: 14, t: 16, b: 24 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const values = data.map((d) => d.value);
  const yMin = Math.min(0, ...values, target ?? 0);
  const yMax = Math.max(100, ...values, target ?? 0);
  const toY = (v: number) => PAD.t + cH - ((v - yMin) / (yMax - yMin || 1)) * cH;
  const toX = (i: number) => PAD.l + (data.length <= 1 ? cW / 2 : (i / (data.length - 1)) * cW);

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(d.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="xMidYMid meet"
      onMouseLeave={() => setHover(null)}
    >
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
            {monthLabel(data[hover].periodMonth, locale)}: {data[hover].value}
          </text>
        </g>
      )}
      {data.map((d, i) => (
        <text key={d.periodMonth} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#8089b3">
          {monthLabel(d.periodMonth, locale)}
        </text>
      ))}
    </svg>
  );
}
