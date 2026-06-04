"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { IconGlossary, IconTable, IconLines } from "@/components/layout/icons";
import { TermEditButton } from "@/components/glossary/TermEditButton";
import { TermHistoryButton } from "@/components/glossary/TermHistoryButton";
import { useLang } from "@/lib/lang-context";
import type { GlossaryTermDetail } from "@/lib/types";

const CLASS_STYLE: Record<string, string> = {
  PUBLIC:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
  INTERNAL:     "bg-blue-50   text-blue-700   border border-blue-200",
  CONFIDENTIAL: "bg-amber-50  text-amber-700  border border-amber-200",
  RESTRICTED:   "bg-red-50    text-red-700    border border-red-200",
  SECRET:       "bg-purple-50 text-purple-700 border border-purple-200",
  TOP_SECRET:   "bg-red-100   text-red-900    border border-red-300",
};

interface Props {
  term:    GlossaryTermDetail;
  canEdit: boolean;
}

export function GlossaryTermPageClient({ term, canEdit }: Props) {
  const { t } = useLang();
  const g = t.glossary;
  const c = t.catalog;

  const TERM_TYPE_LABEL: Record<string, string> = {
    TERM:       g.termTypeTerm,
    KPI_METRIC: g.termTypeKpi,
  };

  const CLASS_LABEL: Record<string, string> = {
    PUBLIC: c.classPublic, INTERNAL: c.classInternal,
    CONFIDENTIAL: c.classConfidential, RESTRICTED: c.classRestricted,
    SECRET: c.classSecret, TOP_SECRET: c.classTopSecret,
  };

  const classStyle = term.classCode
    ? CLASS_STYLE[term.classCode.toUpperCase()] ?? ""
    : "";

  function classLabel(code: string | null): string {
    if (!code) return "";
    return CLASS_LABEL[code.toUpperCase()] ?? (code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " "));
  }

  function ClassBadge({ code }: { code: string | null }) {
    if (!code) return null;
    const style = CLASS_STYLE[code.toUpperCase()] ?? "bg-gray-50 text-gray-600 border border-gray-200";
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold ${style}`}>
        {classLabel(code)}
      </span>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="card p-5">
        <h3 className="text-sm font-bold text-brand-deep mb-3 pb-2.5 border-b border-line-soft">{title}</h3>
        {children}
      </div>
    );
  }

  function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-line-soft last:border-b-0">
        <dt className="text-[11px] uppercase tracking-wider text-muted w-28 shrink-0 pt-0.5">{label}</dt>
        <dd className="flex-1 text-sm text-ink">{children}</dd>
      </div>
    );
  }

  return (
    <main className="px-8 py-7 pb-14">
      {/* Hero */}
      <div className="rounded-xl border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-6 mb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              {term.domainName && <Tag variant="blue">{term.domainName}</Tag>}
              {term.termType && term.termType !== "TERM" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {TERM_TYPE_LABEL[term.termType] ?? term.termType}
                </span>
              )}
              {term.classCode && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold ${classStyle}`}>
                  {classLabel(term.classCode)}
                </span>
              )}
              {term.isPii && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  PII
                </span>
              )}
            </div>

            <h1 className="text-3xl font-extrabold text-brand-deep flex items-center gap-3">
              <IconGlossary className="w-7 h-7 text-brand-purple shrink-0" />
              {term.termName}
            </h1>

            {term.aliases.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[11px] text-muted uppercase tracking-wider">{g.alsoKnownAs}</span>
                {term.aliases.map((a) => (
                  <span key={a.aliasId} className="tag">{a.name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button className="btn btn-sm">{g.follow}</button>
            <TermHistoryButton glossaryId={term.glossaryId} termName={term.termName} />
            {canEdit && <TermEditButton term={term} />}
            <button className="btn btn-primary btn-sm">{g.requestChange}</button>
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-[1fr_300px] gap-6">

        {/* Left: content */}
        <div className="space-y-5">

          <Section title={g.sectionDefinition}>
            <p className="text-[14px] text-ink leading-relaxed">{term.definition}</p>
          </Section>

          {term.businessRules && (
            <Section title={g.sectionBizRules}>
              <div className="space-y-2">
                {term.businessRules.split(/\.\s+/).filter(Boolean).map((rule, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-brand-purple/10 text-brand-purple text-[10px] font-bold grid place-items-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-ink-soft leading-snug">{rule}.</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(term.format || term.example) && (
            <Section title={g.sectionFormat}>
              <div className="grid grid-cols-2 gap-4">
                {term.format && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-2">{g.formatLabel}</div>
                    <code className="block bg-canvas-soft border border-line rounded-md px-4 py-3 text-[13px] font-mono text-brand-deep">
                      {term.format}
                    </code>
                  </div>
                )}
                {term.example && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-2">{g.exampleValue}</div>
                    <div className="bg-canvas-soft border border-line rounded-md px-4 py-3 text-[13px] text-ink-soft leading-snug">
                      {term.example}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {term.linkedAttributes.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
                <h3 className="font-bold text-sm">
                  {g.sectionLinkedAttrs}
                  <span className="text-muted text-xs font-normal ml-2">
                    {term.linkedAttributes.length} {g.colColumn.toLowerCase()}{term.linkedAttributes.length !== 1 ? "s" : ""}
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                <div>{g.colColumn}</div>
                <div>{g.colTable}</div>
                <div>{g.colType}</div>
                <div>{g.colClassification}</div>
              </div>
              {term.linkedAttributes.map((a) => (
                <Link
                  key={a.attributeId}
                  href={`/catalog/${a.schemaId}/tables/${a.entityId}`}
                  className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-brand-deep">
                    <IconLines className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                    {a.physicalName}
                    {a.friendlyName && (
                      <span className="text-muted font-normal text-[11px]">({a.friendlyName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-ink-soft">
                    <IconTable className="w-3.5 h-3.5 shrink-0" />
                    {a.entityName}
                  </div>
                  <div className="font-mono text-[12px] text-ink-soft">{a.dataType}</div>
                  <div><ClassBadge code={a.classCode} /></div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: properties sidebar */}
        <aside className="space-y-5">
          <Section title={g.propertiesSection}>
            <dl className="divide-y divide-line-soft">
              <PropRow label={g.propDomain}>
                {term.domainName
                  ? <Link href={`/glossary?domain=${term.domainId}`} className="text-brand-purple hover:underline font-medium">{term.domainName}</Link>
                  : <span className="text-muted">—</span>}
              </PropRow>
              <PropRow label={g.propTermType}>
                <span className="text-ink text-[12px]">
                  {term.termType ? (TERM_TYPE_LABEL[term.termType] ?? term.termType) : g.termTypeTerm}
                </span>
              </PropRow>
              <PropRow label={g.colClassification}>
                {term.classCode ? <ClassBadge code={term.classCode} /> : <span className="text-muted">—</span>}
              </PropRow>
              <PropRow label={g.propPii}>
                {term.isPii
                  ? <span className="text-red-600 font-semibold text-[12px]">{g.yesPersonalData}</span>
                  : <span className="text-emerald-600 font-semibold text-[12px]">{g.noPersonalData}</span>}
              </PropRow>
              {term.piCategory && (
                <PropRow label={g.propPiCategory}>
                  <span className="text-ink text-[12px]">{term.piCategory}</span>
                </PropRow>
              )}
              {term.npiCategory && (
                <PropRow label={g.propNpiCategory}>
                  <span className="text-ink text-[12px]">{term.npiCategory}</span>
                </PropRow>
              )}
              <PropRow label={g.propCreated}>
                <span className="text-ink-soft text-[12px]">
                  {term.createdAt ? new Date(term.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                  }) : "—"}
                </span>
              </PropRow>
              <PropRow label={g.propLinkedCols}>
                <span className="font-semibold text-brand-deep">{term.linkedAttributes.length}</span>
              </PropRow>
              <PropRow label={g.propRetentionCategory}>
                {term.retentionCategoryName ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-purple">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 opacity-70">
                      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 7H7v-4h2v4z"/>
                    </svg>
                    {term.retentionCategoryName}
                  </span>
                ) : (
                  <span className="text-muted text-[12px]">—</span>
                )}
              </PropRow>
            </dl>
          </Section>

          {term.retentionCategoryName && (
            <div className="rounded-xl border border-brand-purple/20 bg-brand-purple/5 p-4">
              <div className="flex items-start gap-2.5">
                <span className="text-lg shrink-0">🗂️</span>
                <div>
                  <div className="text-[11px] font-bold text-brand-purple uppercase tracking-wider mb-1">
                    {g.propRetentionCategory}
                  </div>
                  <div className="text-[12px] text-ink font-medium">{term.retentionCategoryName}</div>
                  <div className="text-[11px] text-muted mt-1">
                    {g.retentionInherited} · {term.linkedAttributes.length} column{term.linkedAttributes.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          {term.aliases.length > 0 && (
            <Section title={`${g.synonymsTitle} (${term.aliases.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {term.aliases.map((a) => (
                  <span key={a.aliasId} className="tag">{a.name}</span>
                ))}
              </div>
            </Section>
          )}

          {term.linkedAttributes.length === 0 && (
            <Section title={g.sectionLinkedAttrs}>
              <div className="text-center py-6 text-muted text-sm">
                <IconLines className="w-8 h-8 mx-auto mb-2 opacity-30" />
                {g.noLinkedColsYet}
              </div>
            </Section>
          )}
        </aside>
      </div>
    </main>
  );
}
