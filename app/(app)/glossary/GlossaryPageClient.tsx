"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { IconGlossary, IconBook, IconChevron } from "@/components/layout/icons";
import { AddAssetModal } from "@/components/catalog/AddAssetModal";
import { DomainEditModal } from "@/components/glossary/DomainEditModal";
import { GlossaryGovernancePanel } from "@/components/glossary/GlossaryGovernancePanel";
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

function SitBadges({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-muted text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} title={name} className="inline-flex items-center max-w-full px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200 truncate">
          {name}
        </span>
      ))}
    </div>
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
  subDomainFilter: number | null;
  canEdit:      boolean;
  canEditGovernance: boolean;
}

export function GlossaryPageClient({ stats, domains, terms, domainFilter, subDomainFilter, canEdit, canEditGovernance }: Props) {
  const { t } = useLang();
  const g = t.glossary;
  const [showNewTerm, setShowNewTerm] = useState(false);
  const [showEditDomain, setShowEditDomain] = useState(false);
  // One shared cache powers both the sidebar tree and the hero's sub-domain
  // display — a domain's sub-domains are fetched once (on sidebar expand, or on
  // navigating straight to a domain/sub-domain URL) and reused for both.
  const [subDomainsByDomain, setSubDomainsByDomain] = useState<Record<number, GlossaryDomain[]>>({});
  const [loadingDomainIds, setLoadingDomainIds] = useState<Set<number>>(new Set());
  const [expandedDomainIds, setExpandedDomainIds] = useState<Set<number>>(new Set());

  const activeDomain = domainFilter
    ? domains.find((d) => d.glossaryId === domainFilter) ?? null
    : null;
  const activeSubDomain = subDomainFilter && activeDomain
    ? subDomainsByDomain[activeDomain.glossaryId]?.find((sd) => sd.glossaryId === subDomainFilter) ?? null
    : null;
  const subDomains = activeDomain ? subDomainsByDomain[activeDomain.glossaryId] ?? [] : [];

  function loadSubDomains(domainId: number, force = false) {
    if (!force && (subDomainsByDomain[domainId] || loadingDomainIds.has(domainId))) return;
    setLoadingDomainIds((prev) => new Set(prev).add(domainId));
    fetch(`/api/glossary/domains/${domainId}`)
      .then((r) => r.ok ? r.json() : { subDomains: [] })
      .then((d) => setSubDomainsByDomain((prev) => ({ ...prev, [domainId]: d.subDomains ?? [] })))
      .catch(() => setSubDomainsByDomain((prev) => ({ ...prev, [domainId]: [] })))
      .finally(() => setLoadingDomainIds((prev) => { const next = new Set(prev); next.delete(domainId); return next; }));
  }

  function toggleExpand(domainId: number) {
    setExpandedDomainIds((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId); else next.add(domainId);
      return next;
    });
    loadSubDomains(domainId);
  }

  // Landing directly on a domain/sub-domain URL (e.g. a term's breadcrumb link)
  // should show the tree already expanded to that point, not collapsed.
  useEffect(() => {
    if (!domainFilter) return;
    setExpandedDomainIds((prev) => new Set(prev).add(domainFilter));
    loadSubDomains(domainFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainFilter]);

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
          {domains.map((d) => {
            const isExpanded = expandedDomainIds.has(d.glossaryId);
            const isDomainActive = domainFilter === d.glossaryId && !subDomainFilter;
            const children = subDomainsByDomain[d.glossaryId];
            return (
              <div key={d.glossaryId}>
                <div
                  className={[
                    "flex items-center gap-1 rounded-md text-sm transition-colors",
                    isDomainActive
                      ? "bg-brand-purple/10 text-brand-deep font-semibold shadow-[inset_3px_0_0_#6058A0]"
                      : "text-ink-soft hover:bg-canvas hover:text-ink",
                  ].join(" ")}
                >
                  <button
                    onClick={() => toggleExpand(d.glossaryId)}
                    className="w-7 h-8 grid place-items-center shrink-0 text-muted hover:text-ink"
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    <IconChevron className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`} />
                  </button>
                  <Link href={`/glossary?domain=${d.glossaryId}`} className="flex items-center gap-2.5 flex-1 min-w-0 py-2 pr-3">
                    <span className="w-2 h-2 rounded-full bg-brand-purple/50 shrink-0" />
                    <span className="flex-1 truncate">{d.termName}</span>
                    {d.termCount > 0 && <span className="text-[11px] text-muted shrink-0">{d.termCount}</span>}
                  </Link>
                </div>
                {isExpanded && (
                  <div className="pl-7 border-l border-line-soft ml-[15px]">
                    {children == null ? (
                      <div className="px-3 py-1.5 text-[11px] text-muted">Loading…</div>
                    ) : children.length === 0 ? (
                      <div className="px-3 py-1.5 text-[11px] text-muted">No sub-domains</div>
                    ) : children.map((sd) => {
                      const isSubActive = subDomainFilter === sd.glossaryId;
                      return (
                        <Link
                          key={sd.glossaryId}
                          href={`/glossary?domain=${d.glossaryId}&subdomain=${sd.glossaryId}`}
                          className={[
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-colors",
                            isSubActive
                              ? "bg-brand-purple/10 text-brand-deep font-semibold"
                              : "text-ink-soft hover:bg-canvas hover:text-ink",
                          ].join(" ")}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-purple/30 shrink-0" />
                          <span className="flex-1 truncate">{sd.termName}</span>
                          {sd.termCount > 0 && <span className="text-[11px] text-muted shrink-0">{sd.termCount}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        {/* Right: terms table */}
        <section>
          {activeDomain && (
            <>
              <div className="rounded-lg border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-5 mb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {activeSubDomain && (
                      <Link href={`/glossary?domain=${activeDomain.glossaryId}`} className="text-[11px] uppercase tracking-wider text-brand-purple hover:underline font-semibold">
                        {activeDomain.termName}
                      </Link>
                    )}
                    <h2 className="text-lg font-bold text-brand-deep mb-1">{activeSubDomain ? activeSubDomain.termName : activeDomain.termName}</h2>
                    <p className="text-sm text-ink-soft">{activeSubDomain ? activeSubDomain.description : activeDomain.description}</p>
                  </div>
                  {canEdit && (
                    <button onClick={() => setShowEditDomain(true)} className="btn btn-sm shrink-0">Edit</button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <ClassBadge code={activeSubDomain ? activeSubDomain.classCode : activeDomain.classCode} />
                  <Tag variant="purple">{activeSubDomain ? activeSubDomain.termCount : activeDomain.termCount} {g.colTerm.toLowerCase()}</Tag>
                </div>
                {subDomains.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-line/60">
                    <div className="text-[11px] uppercase tracking-wider text-muted mb-2">Sub-domains</div>
                    <div className="flex flex-wrap gap-2">
                      {subDomains.map((sd) => (
                        <Link
                          key={sd.glossaryId}
                          href={`/glossary?domain=${activeDomain.glossaryId}&subdomain=${sd.glossaryId}`}
                          className={[
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors",
                            activeSubDomain?.glossaryId === sd.glossaryId
                              ? "bg-brand-purple text-white border-brand-purple"
                              : "bg-white border-line text-ink-soft hover:border-brand-purple hover:text-brand-deep",
                          ].join(" ")}
                        >
                          {sd.termName}
                          {sd.termCount > 0 && <span className="text-[10px] opacity-80">({sd.termCount})</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-5">
                <GlossaryGovernancePanel
                  glossaryId={activeSubDomain ? activeSubDomain.glossaryId : activeDomain.glossaryId}
                  kind={activeSubDomain ? "term" : "domain"}
                  canEdit={canEditGovernance}
                />
              </div>
            </>
          )}

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line-soft">
              <h3 className="font-bold text-sm">
                {activeSubDomain ? activeSubDomain.termName : activeDomain ? activeDomain.termName : g.allTerms}
                <span className="text-muted text-xs font-normal ml-2">{terms.length} {g.colTerm.toLowerCase()}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button className="btn btn-sm">{g.filterBtn}</button>
                <button className="btn btn-sm">{g.sortBtn}</button>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_2fr_1fr_0.7fr_1fr_0.7fr_0.7fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
              <div className="min-w-0 truncate">{g.colTerm}</div>
              <div className="min-w-0 truncate">{g.colDomain}</div>
              <div className="min-w-0 truncate">{g.colDefinition}</div>
              <div className="min-w-0 truncate">{g.colClassification}</div>
              <div className="min-w-0 truncate">{g.colPii}</div>
              <div className="min-w-0 truncate">{g.colSit}</div>
              <div className="min-w-0 truncate">{g.colAliases}</div>
              <div className="min-w-0 truncate">{g.colLinked}</div>
            </div>

            {terms.length === 0 && (
              <div className="py-16 text-center text-muted text-sm">{g.noTermsFound}</div>
            )}

            {terms.map((term) => (
              <Link
                key={term.glossaryId}
                href={`/glossary/${term.glossaryId}`}
                className="grid grid-cols-[2fr_1fr_2fr_1fr_0.7fr_1fr_0.7fr_0.7fr] gap-3 px-5 py-3.5 items-start text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-brand-deep flex items-center gap-1.5 min-w-0">
                    <IconGlossary className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                    <span className="truncate">{term.termName}</span>
                  </div>
                  {term.aliasCount > 0 && (
                    <div className="text-[11px] text-muted mt-0.5">{term.aliasCount} alias{term.aliasCount > 1 ? "es" : ""}</div>
                  )}
                </div>
                <div className="min-w-0">
                  {term.domainName
                    ? <Tag variant="blue" className="max-w-full truncate">{term.domainName}</Tag>
                    : <span className="text-muted">—</span>}
                  {term.subDomainName && (
                    <div className="text-[11px] text-muted mt-1 truncate">{term.subDomainName}</div>
                  )}
                </div>
                <div className="min-w-0 text-ink-soft text-[13px] line-clamp-2 leading-snug">{term.definition}</div>
                <div className="min-w-0"><ClassBadge code={term.classCode} /></div>
                <div className="min-w-0"><PiiBadge isPii={term.isPii} /></div>
                <div className="min-w-0"><SitBadges names={term.sitTypeNames} /></div>
                <div className="min-w-0 text-ink-soft text-xs">{term.aliasCount || "—"}</div>
                <div className="min-w-0">
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
        <AddAssetModal initialKind="BUSINESS_TERM" onClose={() => setShowNewTerm(false)} />
      )}

      {showEditDomain && activeDomain && (
        <DomainEditModal
          glossaryId={activeSubDomain ? activeSubDomain.glossaryId : activeDomain.glossaryId}
          kindLabel={activeSubDomain ? "Sub-domain" : "Domain"}
          termName={activeSubDomain ? activeSubDomain.termName : activeDomain.termName}
          description={activeSubDomain ? activeSubDomain.description : activeDomain.description}
          classCode={activeSubDomain ? activeSubDomain.classCode : activeDomain.classCode}
          onClose={() => {
            setShowEditDomain(false);
            // The cached sub-domain list may now have a stale name/description —
            // force a refetch so the sidebar/hero pick up the change without a full reload.
            loadSubDomains(activeDomain.glossaryId, true);
          }}
        />
      )}
    </main>
  );
}
