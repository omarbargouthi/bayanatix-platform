import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GovernanceDomain } from "@/lib/types";
import Link from "next/link";

function WarnTriangle({ level }: { level: "red" | "amber" }) {
  const color = level === "red" ? "#EF4444" : "#F59E0B";
  return (
    <svg viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="0"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="white" />
    </svg>
  );
}

function warnLevel(alertCount: number): "red" | "amber" | null {
  if (alertCount >= 3) return "red";
  if (alertCount >= 1) return "amber";
  return null;
}

export function DomainCard({ d }: { d: GovernanceDomain }) {
  const href  = d.domainCode === "DCAT" ? "/catalog" : "#";
  const level = warnLevel(d.alertCount);

  return (
    <Link
      href={href}
      className="block bg-white border border-line rounded-lg p-5 transition-all
                 hover:-translate-y-0.5 hover:border-brand-light hover:shadow-sm"
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
        {/* Compliance */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Compliance</div>
          <div className="text-[13px] font-bold text-ink mb-1.5">{d.compliancePct}%</div>
          <ProgressBar value={d.compliancePct} />
        </div>

        {/* Maturity */}
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
        <svg
          key={i}
          className={"w-3 h-3 " + (i <= value ? "opacity-100" : "opacity-20")}
          viewBox="0 0 24 24"
          fill={i <= value ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      ))}
    </div>
  );
}
