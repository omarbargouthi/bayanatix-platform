"use client";

import { useState } from "react";
import Link from "next/link";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Stars } from "@/components/catalog/DomainCard";
import { useLang } from "@/lib/lang-context";
import type { FrameworkMaturity, MaturityLevelBand } from "@/lib/queries/maturity-overview";

// The maturity of each domain of a maturity-mode regulation (NDI, NAII, …), shown the
// same way as the Dashboard's domain cards: stars and score out of 5 in the colour of
// the level reached, and the score as a percentage. One tab per regulation.
export function MaturityByDomain({ frameworks }: { frameworks: FrameworkMaturity[] }) {
  const { t, lang } = useLang();
  const m = t.governance.maturity;
  const card = t.dashboard.domainCard;
  const [activeId, setActiveId] = useState<number | null>(frameworks[0]?.frameworkId ?? null);
  const fw = frameworks.find((f) => f.frameworkId === activeId) ?? frameworks[0];
  const levelName = (l: MaturityLevelBand) => (lang === "ar" && l.nameAr ? l.nameAr : l.name);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-brand-deep">{m.title}</h2>
          <p className="text-sm text-ink-soft mt-0.5">{m.desc}</p>
        </div>
        {frameworks.length > 1 && (
          <div className="flex gap-1 p-1 bg-canvas-soft border border-line rounded-lg">
            {frameworks.map((f) => (
              <button key={f.frameworkId} onClick={() => setActiveId(f.frameworkId)}
                className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                  f.frameworkId === fw?.frameworkId ? "bg-white text-brand-purple shadow-xs border border-line" : "text-ink-soft hover:text-ink border border-transparent"
                }`}>
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!fw ? (
        <div className="card p-6 text-sm text-muted">{m.none}</div>
      ) : (
        <>
          {/* Overall */}
          <div className="card p-5 mb-4 flex items-center gap-6 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{m.overall}</div>
              <div className="font-bold text-brand-deep truncate">{fw.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <Stars value={fw.score} color={fw.level.colorHex} size={18} />
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold" style={{ color: fw.level.colorHex }}>{fw.score.toFixed(2)}</span>
                <span className="text-[12px] text-muted">/ 5 · {levelName(fw.level)}</span>
              </div>
            </div>
            <div className="w-40">
              <div className="text-[12px] font-bold text-ink mb-1">{Math.round((fw.score / 5) * 100)}%</div>
              <ProgressBar value={Math.round((fw.score / 5) * 100)} />
            </div>
            <Link href={`/governance/compliance?fw=${fw.frameworkId}`} className="btn btn-sm">{m.openAssessment}</Link>
          </div>

          {/* Domains */}
          {fw.domains.length === 0 ? (
            <div className="card p-6 text-sm text-muted">{m.noDomains}</div>
          ) : (
            <div className="grid grid-cols-3 gap-5">
              {fw.domains.map((d) => {
                const pct = Math.round((d.score / 5) * 100);
                return (
                  <Link key={d.domainCode} href={`/governance/compliance?fw=${fw.frameworkId}`}
                    className="block bg-white border border-line rounded-lg p-5 transition-all hover:border-brand-light hover:shadow-sm hover:-translate-y-0.5">
                    <h3 className="text-[14px] font-bold text-brand-deep leading-snug mb-1" dir="auto">{lang === "ar" && d.nameAr ? d.nameAr : d.nameEn}</h3>
                    <p className="text-[12px] text-muted leading-snug mb-4">
                      {m.standardsAssessed.replace("{done}", String(d.assessedStandards)).replace("{total}", String(d.totalStandards))}
                    </p>
                    <div className="grid grid-cols-2 gap-x-5 pt-3 border-t border-line-soft">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{card.compliance}</div>
                        <div className="text-[13px] font-bold text-ink mb-1.5">{pct}%</div>
                        <ProgressBar value={pct} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{card.maturity}</div>
                        <Stars value={d.score} color={d.level.colorHex} />
                        <div className="mt-1 flex items-baseline gap-1">
                          <span className="text-[11px] font-bold" style={{ color: d.level.colorHex }}>{d.score.toFixed(2)}</span>
                          <span className="text-[10px] text-muted">/ 5 · {levelName(d.level)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
