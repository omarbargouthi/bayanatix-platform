"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import type { GovernanceDomain } from "@/lib/types";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";

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
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill={fill}
      />
      <rect x="11.1" y="9" width="1.8" height="5" rx="0.9" fill="white" />
      <circle cx="12" cy="17" r="1" fill="white" />
    </svg>
  );
}

const accentClass: Record<NonNullable<WarnLevel>, string> = {
  red:   "border-t-2 border-t-red-400",
  amber: "border-t-2 border-t-amber-400",
};

export function DomainCard({ d, labels }: { d: GovernanceDomain; labels?: { compliance: string; maturity: string } }) {
  const { isRtl } = useLang();
  const DOMAIN_HREFS: Record<string, string> = {
    DG:   "/governance",
    DCAT: "/catalog",
    DQ:   "/quality",
  };
  const href = DOMAIN_HREFS[d.domainCode] ?? "#";
  const requestCount = d.openRequestCount ?? 0;
  const level        = warnLevel(requestCount);
  const displayName        = isRtl && d.nameAr        ? d.nameAr        : d.name;
  const displayDescription = isRtl && d.descriptionAr ? d.descriptionAr : d.description;

  return (
    <div
      className={[
        "relative bg-white border border-line rounded-lg transition-all",
        "hover:border-brand-light hover:shadow-sm",
        level ? accentClass[level] : "",
      ].join(" ")}
    >
      {/* Warning triangle — separate link to filtered requests page */}
      {level && (
        <Link
          href={`/requests?domain=${d.domainCode}`}
          className="absolute top-3 right-3 flex items-center gap-1 z-10 hover:opacity-75"
          title={`${requestCount} open request${requestCount !== 1 ? "s" : ""}`}
        >
          <WarnTriangle level={level} />
          <span
            className={`text-[11px] font-bold leading-none ${
              level === "red" ? "text-red-500" : "text-amber-600"
            }`}
          >
            {requestCount}
          </span>
        </Link>
      )}

      {/* Card body — navigates to domain detail */}
      <Link
        href={href}
        className={["block p-5 hover:-translate-y-0.5 transition-transform", level ? "pr-12" : ""].join(" ")}
      >
        <h3 className="text-[14px] font-bold text-brand-deep leading-snug mb-1">{displayName}</h3>

        <p className="text-[12px] text-muted leading-snug mb-4">{displayDescription}</p>

        <div className="grid grid-cols-2 gap-x-5 pt-3 border-t border-line-soft">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{labels?.compliance ?? "Compliance"}</div>
            <div className="text-[13px] font-bold text-ink mb-1.5">{d.compliancePct}%</div>
            <ProgressBar value={d.compliancePct} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{labels?.maturity ?? "Maturity"}</div>
            <Stars value={d.maturityLevel} />
            <div className="mt-1">
              <span className="text-[11px] font-bold text-brand-purple">{d.level}</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
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
