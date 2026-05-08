import { ProgressBar } from "@/components/ui/ProgressBar";
import { IconWarn } from "@/components/layout/icons";
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
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="text-[15px] font-bold text-brand-deep">{d.name}</h3>
        {d.alertCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
            <IconWarn className="w-3.5 h-3.5" />
            {d.alertCount}
          </span>
        )}
      </div>
      <p className="text-[13px] text-ink-soft mb-4 leading-snug">{d.description}</p>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-line-soft">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Compliance</div>
          <ProgressBar value={d.compliancePct} />
          <div className="text-[13px] font-semibold text-ink mt-1.5">{d.compliancePct}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Maturity</div>
          <Stars value={d.maturityLevel} />
          <span className="text-xs font-bold text-brand-purple ml-1">{d.level}</span>
        </div>
      </div>
    </Link>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5 text-brand-purple mt-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={"w-3 h-3 " + (i <= value ? "" : "opacity-25")}
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
