// Static SVG visualization with sensible mock series shape — the fetch hook
// can later be wired to a real time-series query without touching this component.
export function MaturityChart() {
  return (
    <svg viewBox="0 0 480 180" width="100%" height="170" preserveAspectRatio="none">
      <defs>
        <linearGradient id="m-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6058A0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#6058A0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#eef0fb" strokeWidth="1">
        <line x1="0" x2="480" y1="40" y2="40" />
        <line x1="0" x2="480" y1="80" y2="80" />
        <line x1="0" x2="480" y1="120" y2="120" />
      </g>
      <path
        d="M0,135 L48,128 L96,130 L144,118 L192,112 L240,108 L288,100 L336,98 L384,92 L432,86 L480,82"
        fill="none"
        stroke="#81B4E1"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <path
        d="M0,120 L48,108 L96,118 L144,90 L192,86 L240,72 L288,76 L336,58 L384,52 L432,38 L480,30 L480,180 L0,180 Z"
        fill="url(#m-grad)"
      />
      <path
        d="M0,120 L48,108 L96,118 L144,90 L192,86 L240,72 L288,76 L336,58 L384,52 L432,38 L480,30"
        fill="none"
        stroke="#6058A0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="#8089b3" fontSize="10">
        {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov"].map((m, i) => (
          <text key={m} x={i * 48} y={172}>{m}</text>
        ))}
      </g>
    </svg>
  );
}
