import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GovernanceDomain } from "@/lib/types";
import Link from "next/link";

type WarnLevel = "red" | "amber" | null;

function warnLevel(n: number): WarnLevel {
  if (n >= 3) return "red";
  if (n >= 1) return "amber";
  return null;
}

function WarnTriangle({ level }: { level: "red" | "amber" }) {
  const fill = level === "red" ? "#EF4444" : "#F59E0B";
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      {/* Filled triangle */}
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill={fill}
      />
      {/* Exclamation bar */}
      <rect x="11.1" y="9" width="1.8" height="5" rx="0.9" fill="white" />
      {/* Exclamation dot */}
      <circle cx="12" cy="17" r="1" fill="white" />
    </svg>
  );
}

// Border-top colour when warning is present — makes the alert visible at card level
const accentClass: Record<NonNullable<WarnLevel>, string> = {
  red:   "border-t-2 border-t-red-400",
  amber: "border-t-2 border-t-amber-400",
};

export function DomainCard({ d }: { d: GovernanceDomain }) {
  const href  = d.domainCode === "DCAT" ? "/catalog" : "#";
  const level = warnLevel(d.alertCount);

  return (
    <Link
      href={href}
      className={[
        "block bg-white border border-line rounded-lg p-5 transition-all",
        "hover:-translate-y-0.5 hover:border-brand-light hover:shadow-sm",
        level ? accentClass[level] : "",
      ].join(" ")}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-[14px] font-bold text-brand-deep leading-snug">{d.name}</h3>
        {level && (
          <div className="shrink-0 pt-0.5">
            <WarnTriangle level={level} />
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-[12px] text-muted leading-snug mb-4">{d.description}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-5 pt-3 border-t border-line-soft">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Compliance</div>
          <div className="text-[13px] font-bold text-ink mb-1.5">{d.compliancePct}%</div>
          <ProgressBar value={d.compliancePct} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Maturity</div>
          <Stars value={d.maturityLevel} />
          <div className="mt-1">
            <span className="text-[11px] font-bold text-brand-purple">{d.level}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5 text-brand-purple">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width="12" height="12"
          fill={i <= value ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          className={i <= value ? "opacity-100" : "opacity-20"}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      ))}
    </div>
  );
}
