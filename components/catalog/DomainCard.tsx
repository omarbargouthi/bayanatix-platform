import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconBell, IconFlag } from "@/components/layout/icons";
import type { GovernanceDomain } from "@/lib/types";
import Link from "next/link";

export function DomainCard({ d }: { d: GovernanceDomain }) {
  const href = d.domainCode === "DCAT" ? "/catalog" : "#";
  return (
    <Link
      href={href}
      className="block bg-white border border-line rounded-lg p-5 transition-all
                 hover:-translate-y-0.5 hover:border-brand-light hover:shadow-sm"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-[14px] font-bold text-brand-deep leading-snug">{d.name}</h3>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <IconBell className="w-3.5 h-3.5 text-amber-400" />
          <IconFlag className="w-3.5 h-3.5 text-amber-400" />
        </div>
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
