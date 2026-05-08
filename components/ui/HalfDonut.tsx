// Half-donut gauge: arc on top, flat diameter at bottom.
// Uses circle + strokeDasharray + rotate(180) so the stroke starts at the
// 9-o'clock position and sweeps clockwise through 12 to 3 o'clock (top half only).

type Props = {
  value:          number;   // 0..100  (current period)
  previousValue?: number;   // 0..100  (previous period, drives the delta badge)
  prevLabel?:     string;   // e.g. "Q3 2025"
  size?:          number;   // overall SVG width
  strokeWidth?:   number;
};

export function HalfDonut({
  value,
  previousValue,
  prevLabel = "last period",
  size        = 200,
  strokeWidth = 24,
}: Props) {
  const r   = (size - strokeWidth) / 2;   // radius to stroke centre-line
  const cx  = size / 2;
  // Position the centre so the arc top sits just below y=0 with a couple px padding
  const cy  = r + strokeWidth / 2 + 4;
  const h   = cy + 20;                    // viewBox height (flat edge + label row)

  const C     = 2 * Math.PI * r;          // full circumference
  const halfC = C / 2;                    // half circumference = top arc length

  const pct     = Math.max(0, Math.min(100, value));
  const fillLen = (pct / 100) * halfC;    // how much of the top arc to colour

  const delta    = previousValue !== undefined ? +(value - previousValue).toFixed(1) : null;
  const deltaPos = delta !== null && delta >= 0;
  const badgeColor = delta === null ? "#6058A0" : deltaPos ? "#10B981" : "#EF4444";
  const sign       = delta !== null && delta > 0 ? "+" : "";

  // Percentage label: sit at the visual centroid of the semicircle (4r/3π above diameter)
  const labelY = cy - (4 * r) / (3 * Math.PI);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Delta badge */}
      {delta !== null && (
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {sign}{Math.abs(delta)}% vs {prevLabel}
        </span>
      )}

      <svg width={size} viewBox={`0 0 ${size} ${h}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="hd-g" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#81B4E1" />
            <stop offset="100%" stopColor="#6058A0" />
          </linearGradient>
        </defs>

        {/* Background track — full top half, grey */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#e6e9f5"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={`${halfC} ${halfC}`}
          transform={`rotate(180 ${cx} ${cy})`}
        />

        {/* Coloured fill — proportional to pct */}
        {pct > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="url(#hd-g)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${fillLen} ${C - fillLen}`}
            transform={`rotate(180 ${cx} ${cy})`}
          />
        )}

        {/* Percentage label */}
        <text
          x={cx}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.19}
          fontWeight={800}
          fill="#201C55"
          fontFamily="Inter, sans-serif"
        >
          {Math.round(pct)}%
        </text>

        {/* 0 % / 100 % axis ticks */}
        <text x={cx - r} y={cy + 16} textAnchor="middle" fontSize="9" fill="#8089b3">0%</text>
        <text x={cx + r} y={cy + 16} textAnchor="middle" fontSize="9" fill="#8089b3">100%</text>
      </svg>
    </div>
  );
}
