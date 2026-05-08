// Half-donut (gauge) chart.  Flat edge at bottom, arc across the top.
// `value` and `previousValue` are 0-100 percentages.

type Props = {
  value:         number;
  previousValue?: number;
  prevLabel?:    string;
  size?:         number;
  strokeWidth?:  number;
};

function arcPath(cx: number, cy: number, r: number, pct: number) {
  // Start: left  (cx-r, cy)
  // End  : right (cx+r, cy) when pct=100
  // Direction: counter-clockwise through the top (sweep-flag = 0)
  const angle = (1 - pct / 100) * Math.PI; // radians from positive-x axis
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  // largeArc is never needed for a ≤180° arc
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${ex} ${ey}`;
}

export function HalfDonut({
  value,
  previousValue,
  prevLabel = "last period",
  size = 200,
  strokeWidth = 22,
}: Props) {
  const r  = (size - strokeWidth) / 2;
  const cx = size / 2;
  // Position the flat edge 10 px above the SVG bottom so labels fit
  const cy = r + strokeWidth / 2 + 4;
  const h  = cy + 22; // viewBox height

  const pct   = Math.max(0, Math.min(100, value));
  const delta = previousValue !== undefined ? +(value - previousValue).toFixed(1) : null;

  const bgPath   = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;
  const fillPath = pct <= 0 ? null : pct >= 100 ? bgPath : arcPath(cx, cy, r, pct);

  const deltaColor = delta === null ? "" : delta >= 0 ? "#10B981" : "#EF4444";
  const deltaSign  = delta !== null && delta > 0 ? "+" : "";

  // Percentage label sits at centroid of the semi-circle: 4r/3π above the diameter
  const labelY = cy - (4 * r) / (3 * Math.PI) + 6;

  return (
    <div className="flex flex-col items-center gap-1">
      {delta !== null && (
        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: deltaColor }}
        >
          {deltaSign}{Math.abs(delta)}% vs {prevLabel}
        </span>
      )}
      <svg width={size} viewBox={`0 0 ${size} ${h}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="hd-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#81B4E1" />
            <stop offset="100%" stopColor="#6058A0" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <path d={bgPath} fill="none" stroke="#eef0fb" strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Filled arc */}
        {fillPath && (
          <path d={fillPath} fill="none" stroke="url(#hd-grad)" strokeWidth={strokeWidth} strokeLinecap="round" />
        )}

        {/* Percentage */}
        <text
          x={cx} y={labelY}
          textAnchor="middle"
          fontSize={size * 0.17}
          fontWeight={800}
          fill="#201C55"
          fontFamily="Inter, sans-serif"
        >
          {Math.round(pct)}%
        </text>

        {/* 0% / 100% axis labels */}
        <text x={cx - r} y={cy + 16} textAnchor="middle" fontSize="10" fill="#8089b3">0%</text>
        <text x={cx + r} y={cy + 16} textAnchor="middle" fontSize="10" fill="#8089b3">100%</text>
      </svg>
    </div>
  );
}
