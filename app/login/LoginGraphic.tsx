// Decorative data-graph illustration for the login panel — abstract nodes and
// connecting edges evoke a catalog/lineage graph without depicting real data.
// Pure inline SVG (no image asset) so it always renders crisply and matches the
// brand palette exactly; a couple of nodes get Tailwind's built-in pulse for a
// subtle "live platform" feel without hand-rolled keyframes.
export function LoginGraphic({ className }: { className?: string }) {
  const edges: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 5], [2, 5], [3, 6], [4, 6],
    [5, 6], [1, 2], [3, 4],
  ];
  const nodes = [
    { x: 200, y: 190, r: 15 }, // hub — the catalog
    { x: 90, y: 90, r: 8 },
    { x: 300, y: 80, r: 7 },
    { x: 320, y: 240, r: 9 },
    { x: 110, y: 290, r: 6 },
    { x: 190, y: 60, r: 5 },
    { x: 230, y: 320, r: 6 },
  ];

  return (
    <svg viewBox="0 0 400 400" className={className} fill="none" aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke="white" strokeOpacity={0.16} strokeWidth={1.25}
        />
      ))}
      {nodes.map((n, i) => (
        <circle
          key={i}
          cx={n.x} cy={n.y} r={n.r}
          fill={i === 0 ? "white" : "#B7C4EE"}
          fillOpacity={i === 0 ? 0.95 : 0.55}
          className={i === 2 || i === 4 ? "animate-pulse" : undefined}
        />
      ))}
    </svg>
  );
}
