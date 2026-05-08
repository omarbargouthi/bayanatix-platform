export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-full bg-canvas overflow-hidden" style={{ height }}>
      <div
        className="h-full bg-gradient-to-r from-brand-light to-brand-purple"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
