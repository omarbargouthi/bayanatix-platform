"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { IconGlossary, IconBook } from "@/components/layout/icons";
import { NewTermModal } from "@/components/glossary/NewTermModal";
import { useLang } from "@/lib/lang-context";
import type { GlossaryStats } from "@/lib/queries/glossary";
import type { GlossaryDomain, GlossaryTerm } from "@/lib/types";

const CLASS_STYLE: Record<string, string> = {
  PUBLIC:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERNAL:     "bg-blue-50   text-blue-700   border-blue-200",
  CONFIDENTIAL: "bg-amber-50  text-amber-700  border-amber-200",
  RESTRICTED:   "bg-red-50    text-red-700    border-red-200",
  SECRET:       "bg-purple-50 text-purple-700 border-purple-200",
};

function ClassBadge({ code }: { code: string | null }) {
  const { t } = useLang();
  const c = t.catalog;
  if (!code) return <span className="text-muted text-xs">—</span>;
  const style = CLASS_STYLE[code.toUpperCase()] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const labels: Record<string, string> = {
    PUBLIC: c.classPublic, INTERNAL: c.classInternal, CONFIDENTIAL: c.classConfidential,
    RESTRICTED: c.classRestricted, SECRET: c.classSecret,
  };
  const label = labels[code.toUpperCase()] ?? (code.charAt(0) + code.slice(1).toLowerCase());
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${style}`}>
      {label}
    </span>
  );
}

function PiiBadge({ isPii }: { isPii: boolean }) {
  if (!isPii) return <span className="text-muted text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
      PII
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: "purple" | "blue" | "green" | "red" }) {
  const ring = {
    purple: "border-l-brand-purple  bg-brand-purple/5",
    blue:   "border-l-blue-400    bg-blue-50/60",
    green:  "border-l-emerald-400 bg-emerald-50/60",
    red:    "border-l-red-400     bg-red-50/60",
  }[color];
  const text = {
    purple: "text-brand-purple",
    blue:   "text-blue-600",
    green:  "text-emerald-600",
    red:    "text-red-600",
  }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

interface Props {
  stats:        GlossaryStats;
  domains:      GlossaryDomain[];
  terms:        GlossaryTerm[];
  domainFilter: number | null;
  canEdit:      boolean;
}

export function GlossaryPageClient({ stats, domains, terms, domainFilter, canEdit }: Props) {
  const { t } = useLang();
  const g = t.glossary;
  const [showNewTerm, setShowNewTerm] = useState(false);

  const activeDomain = domainFilter
    ? domains.find((d) => d.glossaryId === domainFilter) ?? null
    : null;

  return (
    <main className="px-8 py-7 pb-14">
      {/* Page header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2.5 text-brand-deep">
          <IconGlossary className="w-6 h-6 text-brand-purple" />
          {g.pageTitle}
        </h1>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm">{g.exportBtn}</button>
          {canEdit && (
            <button onClick={() => setShowNewTerm(true)} className="btn btn-primary btn-sm">
              {g.newTerm}
            </button>
          )}
        </div>
      </div>
      <p className="text-ink-soft text-sm mb-7 max-w-2xl">{g.pageDesc}</p>

      {/* Stats row */}
      <section className="grid grid-cols-4 gap-4 mb-7">
        <StatCard label={g.totalTerms}  value={stats.totalTerms}  color="purple" />
        <StatCard label={g.domains}     value={stats.domains}     color="blue" />
        <StatCard label={g.linkedAttrs} value={stats.linkedAttrs} color="green" />
        <StatCard label={g.piiTerms}    value={stats.piiTerms}    color="red" />
      </section>

      {/* Two-column layout */}
      <div className="grid grid-cols-[260px_1fr] gap-6">

        {/* Left: domain tree */}
        <aside className="card p-3.5 self-start sticky top-24">
          <h4 className="text-[11px] uppercase tracking-wider text-muted px-3 pb-2.5">{g.domainsTitle}</h4>
          <Link
            href="/glossary"
            className={[
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              !domainFilter
                ? "bg-brand-purple/10 text-brand-deep font-semibold shadow-[inset_3px_0_0_#6058A0]"
                : "text-ink-soft hover:bg-canvas hover:text-ink",
            ].join(" ")}
          >
            <IconBook className="w-4 h-4 shrink-0" />
            <span className="flex-1">{g.allTerms}</span>
            <span className="text-[11px] text-muted">{stats.totalTerms}</span>
          </Link>
          {domains.map((d) => (
            <Link
              key={d.glossaryId}
              href={`/glossary?domain=${d.glossaryId}`}
              className={[
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                domainFilter === d.glossaryId
                  ? "bg-brand-purple/10 text-brand-deep font-semibold shadow-[inset_3px_0_0_#6058A0]"
                  : "text-ink-soft hover:bg-canvas hover:text-ink",
              ].join(" ")}
            >
              <span className="w-2 h-2 rounded-full bg-brand-purple/50 shrink-0" />
              <span className="flex-1 truncate">{d.termName}</span>
              {d.termCount > 0 && (
                <span className="text-[11px] text-muted">{d.termCount}</span>
              )}
            </Link>
          ))}
        </aside>

        {/* Right: terms table */}
        <section>
          {activeDomain && (
            <div className="rounded-lg border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-5 mb-5">
              <h2 className="text-lg font-bold text-brand-deep mb-1">{activeDomain.termName}</h2>
              <p className="text-sm text-ink-soft">{activeDomain.description}</p>
              <div className="flex items-center gap-2 mt-3">
                <ClassBadge code={activeDomain.classCode} />
                <Tag variant="purple">{activeDomain.termCount} {g.colTerm.toLowerCase()}</Tag>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line-soft">
              <h3 className="font-bold text-sm">
                {activeDomain ? activeDomain.termName : g.allTerms}
                <span className="text-muted text-xs font-normal ml-2">{terms.length} {g.colTerm.toLowerCase()}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button className="btn btn-sm">{g.filterBtn}</button>
                <button className="btn btn-sm">{g.sortBtn}</button>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_2.5fr_1fr_0.8fr_0.8fr_0.7fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
              <div>{g.colTerm}</div>
              <div>{g.colDomain}</div>
              <div>{g.colDefinition}</div>
              <div>{g.colClassification}</div>
              <div>{g.colPii}</div>
              <div>{g.colAliases}</div>
              <div>{g.colLinked}</div>
            </div>

            {terms.length === 0 && (
              <div className="py-16 text-center text-muted text-sm">{g.noTermsFound}</div>
            )}

            {terms.map((term) => (
              <Link
                key={term.glossaryId}
                href={`/glossary/${term.glossaryId}`}
                className="grid grid-cols-[2fr_1fr_2.5fr_1fr_0.8fr_0.8fr_0.7fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
              >
                <div>
                  <div className="font-semibold text-brand-deep flex items-center gap-1.5">
                    <IconGlossary className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                    {term.termName}
                  </div>
                  {term.aliasCount > 0 && (
                    <div className="text-[11px] text-muted mt-0.5">{term.aliasCount} alias{term.aliasCount > 1 ? "es" : ""}</div>
                  )}
                </div>
                <div>
                  {term.domainName
                    ? <Tag variant="blue">{term.domainName}</Tag>
                    : <span className="text-muted">—</span>}
                </div>
                <div className="text-ink-soft text-[13px] line-clamp-2 leading-snug">{term.definition}</div>
                <div><ClassBadge code={term.classCode} /></div>
                <div><PiiBadge isPii={term.isPii} /></div>
                <div className="text-ink-soft text-xs">{term.aliasCount || "—"}</div>
                <div>
                  {term.linkedAttrCount > 0
                    ? <Tag variant="green">{term.linkedAttrCount} col{term.linkedAttrCount > 1 ? "s" : ""}</Tag>
                    : <span className="text-muted text-xs">—</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {showNewTerm && (
        <NewTermModal domains={domains} onClose={() => setShowNewTerm(false)} />
      )}
    </main>
  );
}
