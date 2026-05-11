"use client";

import { useState } from "react";
import type { EntityProfileData, AttributeProfile } from "@/lib/queries/catalog";
import type { DataAttribute } from "@/lib/types";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat().format(Number(n));
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function ModeLabel({ mode, limit }: { mode: string | null; limit: number | null }) {
  if (!mode) return null;
  const labels: Record<string, string> = { TOP_N: "Top N rows", TOP_PCT: "Top % sample", FULL: "Full scan" };
  const val = mode === "TOP_N" ? `${fmt(limit)} rows` : mode === "TOP_PCT" ? `${limit}%` : "all rows";
  return <span>{labels[mode] ?? mode} · {val}</span>;
}

function TopValues({ values }: { values: { value: string; count: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!values.length) return <span className="text-muted">—</span>;
  const shown = expanded ? values : values.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {shown.map((v, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-brand-purple/8 text-brand-deep px-1.5 py-0.5 rounded font-mono max-w-[120px]" title={`${v.value} (${v.count}×)`}>
          <span className="truncate">{v.value === "" ? <em className="text-muted not-italic">(empty)</em> : v.value}</span>
          <span className="text-muted shrink-0">{v.count}</span>
        </span>
      ))}
      {values.length > 3 && (
        <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-brand-purple hover:underline">
          {expanded ? "less" : `+${values.length - 3}`}
        </button>
      )}
    </div>
  );
}

function NullBar({ pct }: { pct: number }) {
  const w = Math.min(100, Math.max(0, pct));
  const color = w > 20 ? "bg-red-400" : w > 5 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-line flex-shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-[11px] text-ink">{pct.toFixed(1)}%</span>
    </div>
  );
}

export function ProfilingPanel({
  profile,
  attributes,
}: {
  profile: EntityProfileData;
  attributes: DataAttribute[];
}) {
  const byAttrId = new Map<number, AttributeProfile>(
    profile.attributes.map(a => [a.attributeId, a])
  );

  const fmt2 = (d: string) => new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="card overflow-hidden mt-5">
      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft bg-canvas-soft">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple shrink-0">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <div>
            <h3 className="font-bold text-sm">Data Profile</h3>
            <div className="text-[11px] text-muted mt-0.5">Last run: {fmt2(profile.profiledAt)}</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-[12px] text-ink-soft">
          <div className="text-center">
            <div className="font-bold text-brand-deep text-sm">{fmt(profile.rowCount)}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Total rows</div>
          </div>
          {profile.sampleSize !== profile.rowCount && profile.sampleSize != null && (
            <div className="text-center">
              <div className="font-bold text-brand-deep text-sm">{fmt(profile.sampleSize)}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide">Sampled</div>
            </div>
          )}
          <div className="text-center">
            <div className="font-bold text-brand-deep text-sm">{profile.attributes.length}</div>
            <div className="text-[10px] text-muted uppercase tracking-wide">Columns profiled</div>
          </div>
          <div className="text-[11px] text-muted border border-line rounded px-2 py-1">
            <ModeLabel mode={profile.profilingMode} limit={profile.profilingLimit} />
          </div>
        </div>
      </div>

      {/* ── Attribute grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1.4fr_70px_80px_100px_100px_1fr] gap-3 px-5 py-2.5 bg-canvas text-[10px] uppercase tracking-wider text-muted font-bold border-b border-line">
        <div>Column</div>
        <div className="text-right">Distinct</div>
        <div>Null %</div>
        <div>Min</div>
        <div>Max</div>
        <div>Top Values</div>
      </div>

      {attributes.map(attr => {
        const p = byAttrId.get(attr.attributeId);
        if (!p) return (
          <div key={attr.attributeId} className="grid grid-cols-[1.4fr_70px_80px_100px_100px_1fr] gap-3 px-5 py-2.5 items-center text-sm border-b border-line-soft last:border-b-0 text-muted">
            <div className="font-mono text-[12px]">{attr.physicalName}</div>
            <div className="text-right text-[11px]">—</div>
            <div className="text-[11px]">—</div>
            <div className="text-[11px]">—</div>
            <div className="text-[11px]">—</div>
            <div className="text-[11px]">—</div>
          </div>
        );
        return (
          <div key={attr.attributeId} className="grid grid-cols-[1.4fr_70px_80px_100px_100px_1fr] gap-3 px-5 py-2.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors">
            <div>
              <span className="font-mono text-[12px] font-semibold text-brand-deep">{attr.physicalName}</span>
              {attr.isPrimaryKey && <span className="ml-1.5 text-[9px] bg-brand-purple/10 text-brand-purple font-bold px-1 py-0.5 rounded">PK</span>}
            </div>
            <div className="text-right font-mono text-[12px]">{fmt(p.distinctCount)}</div>
            <div><NullBar pct={p.nullPct} /></div>
            <div className="font-mono text-[11px] text-ink-soft truncate" title={p.minValue ?? ""}>{p.minValue ?? "—"}</div>
            <div className="font-mono text-[11px] text-ink-soft truncate" title={p.maxValue ?? ""}>{p.maxValue ?? "—"}</div>
            <div><TopValues values={p.topValues} /></div>
          </div>
        );
      })}

      {profile.attributes.length === 0 && (
        <div className="py-8 text-center text-muted text-sm">No column-level profiling data recorded.</div>
      )}
    </div>
  );
}
