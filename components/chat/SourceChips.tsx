"use client";
import Link from "next/link";
import type { SourceRef } from "@/lib/chat/types";

// Multi-asset answers render as a compact chip row rather than a table for v1 —
// each tool caps results at ~10, so a table adds real complexity for marginal
// benefit at foundation-pass scope.
export function SourceChips({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((s) =>
        s.href ? (
          <Link
            key={`${s.assetType}:${s.assetId}`}
            href={s.href}
            className="text-[11px] px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 font-medium"
          >
            {s.label}
          </Link>
        ) : (
          <span key={`${s.assetType}:${s.assetId}`} className="text-[11px] px-2 py-0.5 rounded-full bg-canvas-soft text-ink-soft font-medium">
            {s.label}
          </span>
        ),
      )}
    </div>
  );
}
