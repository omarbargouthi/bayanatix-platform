// Pure-SVG donut chart. Prop-driven so it's reusable across pages.
export function Donut({
  value,
  label,
  size = 160,
  strokeWidth = 18,
  gradientId = "donut-grad",
  startColor = "#81B4E1",
  endColor = "#6058A0",
}: {
  value: number; // 0..100
  label?: string;
  size?: number;
  strokeWidth?: number;
  gradientId?: string;
  startColor?: string;
  endColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2={size} y2={size} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef0fb" strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fontSize={size * 0.18}
        fontWeight={800}
        fill="#201C55"
      >
        {Math.round(value)}%
      </text>
      {label && (
        <text x={cx} y={cy + size * 0.14} textAnchor="middle" fontSize={size * 0.07} fill="#8089b3">
          {label}
        </text>
      )}
    </svg>
  );
}
