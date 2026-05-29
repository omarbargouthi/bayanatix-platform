// NDI / NAII maturity trend — real data, pure SVG.
// Receives data from the dashboard server component.
import type { TrendPoint } from "@/lib/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function MaturityChart({ data, noDataLabel = "No trend data available" }: { data: TrendPoint[]; noDataLabel?: string }) {
  const W = 480, H = 180;
  const PAD = { l: 28, r: 14, t: 24, b: 28 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const Y_MIN = 1, Y_MAX = 5;
  const toY = (v: number) => PAD.t + cH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * cH;
  const toX = (m: number, i: number, total: number) =>
    PAD.l + (total <= 1 ? cW / 2 : (i / (total - 1)) * cW);

  const ndiPts  = data.map((d, i) => `${toX(d.month, i, data.length)},${toY(Number(d.ndiScore))}`).join(" ");
  const naiiPts = data.map((d, i) => `${toX(d.month, i, data.length)},${toY(Number(d.naiiScore))}`).join(" ");

  if (data.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-muted text-sm">
        {noDataLabel}
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="165" preserveAspectRatio="xMidYMid meet">
      {/* Y-axis grid lines & labels (1-5) */}
      {[1, 2, 3, 4, 5].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={toY(v)} y2={toY(v)} stroke="#eef0fb" strokeWidth="1" />
          <text x={PAD.l - 5} y={toY(v) + 3.5} textAnchor="end" fontSize="9" fill="#8089b3">{v}</text>
        </g>
      ))}

      {/* NDI line */}
      <polyline
        points={ndiPts}
        fill="none"
        stroke="#6058A0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* NDI dots */}
      {data.map((d, i) => (
        <circle
          key={`ndi-${d.month}`}
          cx={toX(d.month, i, data.length)}
          cy={toY(Number(d.ndiScore))}
          r="3"
          fill="#6058A0"
        />
      ))}

      {/* NAII line */}
      <polyline
        points={naiiPts}
        fill="none"
        stroke="#81B4E1"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="5 3"
      />
      {/* NAII dots */}
      {data.map((d, i) => (
        <circle
          key={`naii-${d.month}`}
          cx={toX(d.month, i, data.length)}
          cy={toY(Number(d.naiiScore))}
          r="3"
          fill="#81B4E1"
        />
      ))}

      {/* X-axis month labels */}
      {data.map((d, i) => (
        <text
          key={d.month}
          x={toX(d.month, i, data.length)}
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
      <text x={PAD.l + 13} y={12} fontSize="9" fill="#50568a" fontWeight="500">NDI</text>
      <line x1={PAD.l + 38} y1={8} x2={PAD.l + 52} y2={8} stroke="#81B4E1" strokeWidth="2.5" strokeDasharray="4 2" />
      <circle cx={PAD.l + 45} cy={8} r="3" fill="#81B4E1" />
      <text x={PAD.l + 57} y={12} fontSize="9" fill="#50568a" fontWeight="500">NAII</text>
    </svg>
  );
}
