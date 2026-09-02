"use client";

import { useState, useCallback } from "react";
import type { TrendPoint } from "@/lib/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Catmull-Rom → cubic bezier control points for smooth curves
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.map(([x, y]) => `${x},${y}`).join(" ");
  const n = pts.length;
  const parts: string[] = [`M ${pts[0][0]} ${pts[0][1]}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    parts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`);
  }
  return parts.join(" ");
}

type Tooltip = { x: number; y: number; score: number; label: string } | null;

export function MaturityChart({ data, noDataLabel = "No trend data available" }: { data: TrendPoint[]; noDataLabel?: string }) {
  const [tooltip, setTooltip] = useState<Tooltip>(null);

  const W = 480, H = 180;
  const PAD = { l: 28, r: 14, t: 24, b: 28 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const Y_MIN = 0, Y_MAX = 5;
  const toY = (v: number) => PAD.t + cH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * cH;
  const toX = (i: number, total: number) =>
    PAD.l + (total <= 1 ? cW / 2 : (i / (total - 1)) * cW);

  const pts: [number, number][] = data.map((d, i) => [toX(i, data.length), toY(Number(d.maturityScore))]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Map clientX to SVG coordinate space
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // Find the closest data point by x
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const dist = Math.abs(toX(i, data.length) - svgX);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    const pt = data[closest];
    const cx = toX(closest, data.length);
    setTooltip({
      x: cx,
      y: toY(Number(pt.maturityScore)),
      score: Number(pt.maturityScore),
      label: MONTHS[(pt.month ?? 1) - 1],
    });
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-muted text-sm">
        {noDataLabel}
      </div>
    );
  }

  const path = smoothPath(pts);

  // Tooltip position clamped inside chart
  const TIP_W = 74, TIP_H = 30;
  const tipX = tooltip ? Math.min(Math.max(tooltip.x - TIP_W / 2, PAD.l), W - PAD.r - TIP_W) : 0;
  const tipY = tooltip ? Math.max(tooltip.y - TIP_H - 10, PAD.t) : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="165"
      preserveAspectRatio="xMidYMid meet"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
      style={{ cursor: "crosshair" }}
    >
      {/* Y-axis grid lines & labels (1-5) */}
      {[1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#eef0fb" strokeWidth="1" />
          <text x={PAD.l - 5} y={toY(v) + 3.5} textAnchor="end" fontSize="9" fill="#8089b3">{v}</text>
        </g>
      ))}

      {/* NDI overall maturity smooth curve */}
      <path
        d={path}
        fill="none"
        stroke="#6058A0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {data.map((d, i) => (
        <circle key={d.month} cx={pts[i][0]} cy={pts[i][1]} r="3" fill="#6058A0" />
      ))}

      {/* Highlighted dot for hovered point */}
      {tooltip && (() => {
        const idx = data.findIndex((d) => MONTHS[(d.month ?? 1) - 1] === tooltip.label);
        if (idx < 0) return null;
        return (
          <g>
            <circle cx={pts[idx][0]} cy={pts[idx][1]} r="5" fill="#6058A0" stroke="white" strokeWidth="1.5" />
            <line x1={pts[idx][0]} y1={PAD.t} x2={pts[idx][0]} y2={H - PAD.b} stroke="#c0c4e0" strokeWidth="1" strokeDasharray="3 2" />
          </g>
        );
      })()}

      {/* Tooltip box */}
      {tooltip && (
        <g>
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx="5" fill="white" stroke="#dde0f0" strokeWidth="1" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))" />
          <text x={tipX + TIP_W / 2} y={tipY + 11} textAnchor="middle" fontSize="8.5" fill="#8089b3" fontWeight="600">{tooltip.label}</text>
          <circle cx={tipX + 10} cy={tipY + 22} r="3" fill="#6058A0" />
          <text x={tipX + 16} y={tipY + 25.5} fontSize="9" fill="#50568a">
            NDI <tspan fontWeight="700">{tooltip.score.toFixed(2)}</tspan>
          </text>
        </g>
      )}

      {/* X-axis month labels */}
      {data.map((d, i) => (
        <text
          key={d.month}
          x={toX(i, data.length)}
          y={H - 5}
          textAnchor="middle"
          fontSize="9"
          fill="#8089b3"
        >
          {MONTHS[(d.month ?? 1) - 1]}
        </text>
      ))}

      {/* Legend */}
      <rect x={PAD.l} y={4} width={9} height={9} rx="2" fill="#6058A0" />
      <text x={PAD.l + 13} y={12} fontSize="9" fill="#50568a" fontWeight="500">NDI Overall Maturity</text>
    </svg>
  );
}
