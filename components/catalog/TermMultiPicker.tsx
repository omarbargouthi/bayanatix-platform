"use client";

import { useState, useEffect, useRef } from "react";
import type { GlossaryPickerDomain } from "@/app/api/glossary/picker/route";
import type { LinkedTerm } from "@/lib/types";
import { useLang } from "@/lib/lang-context";

const CLASS_DOT: Record<string, string> = {
  PUBLIC: "bg-emerald-500", INTERNAL: "bg-blue-500", CONFIDENTIAL: "bg-amber-500",
  RESTRICTED: "bg-red-500", SECRET: "bg-purple-500", TOP_SECRET: "bg-red-800",
};

// ── Shared term dropdown ────────────────────────────────────────────────────

function TermDropdown({
  domains,
  search,
  onSearch,
  onSelect,
  onBack,
  activeDomain,
  onSetDomain,
  selectedIds,
  singleSelect,
}: {
  domains:      GlossaryPickerDomain[];
  search:       string;
  onSearch:     (v: string) => void;
  onSelect:     (term: GlossaryPickerDomain["terms"][0], domainName: string) => void;
  onBack:       () => void;
  activeDomain: GlossaryPickerDomain | null;
  onSetDomain:  (d: GlossaryPickerDomain | null) => void;
  selectedIds:  Set<number>;
  singleSelect: boolean;
}) {
  const q = search.trim().toLowerCase();
  const flatMatches = q
    ? domains.flatMap((d) =>
        d.terms
          .filter((t) => t.termName.toLowerCase().includes(q) || d.domainName.toLowerCase().includes(q))
          .map((t) => ({ ...t, domainName: d.domainName }))
      )
    : [];

  return (
    <div className="absolute z-50 mt-1 w-full min-w-[280px] bg-white border border-line rounded-xl shadow-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-line-soft">
        <div className="flex items-center gap-2 bg-canvas rounded-md px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            autoFocus value={search}
            onChange={(e) => { onSearch(e.target.value); onSetDomain(null); }}
            placeholder="Search terms…"
            className="bg-transparent outline-none border-0 text-sm flex-1 placeholder-muted"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {!q && !activeDomain && domains.map((d) => (
          <button key={d.glossaryId} type="button" onClick={() => onSetDomain(d)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors">
            <svg className="w-4 h-4 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span className="flex-1 text-sm font-medium text-ink">{d.domainName}</span>
            <span className="text-[11px] text-muted">{d.terms.length}</span>
            <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        ))}
        {!q && activeDomain && (
          <>
            <button type="button" onClick={onBack}
              className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-line-soft text-sm text-muted hover:text-ink">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              {activeDomain.domainName}
            </button>
            {activeDomain.terms.map((t) => {
              const isSel = selectedIds.has(t.glossaryId);
              return (
                <button key={t.glossaryId} type="button" onClick={() => onSelect(t, activeDomain.domainName)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors">
                  {t.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                  <span className="flex-1 text-sm text-ink">{t.termName}</span>
                  {t.isPii && <span className="text-[10px] font-bold text-red-600 border border-red-200 rounded px-1">PII</span>}
                  {isSel && !singleSelect && <svg className="w-3.5 h-3.5 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  {isSel && singleSelect && <span className="text-[10px] font-bold text-brand-purple">selected</span>}
                </button>
              );
            })}
          </>
        )}
        {q && (flatMatches.length === 0
          ? <div className="py-6 text-center text-sm text-muted">No terms match &ldquo;{search}&rdquo;</div>
          : flatMatches.map((t) => {
              const isSel = selectedIds.has(t.glossaryId);
              return (
                <button key={t.glossaryId} type="button" onClick={() => onSelect(t, t.domainName)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors">
                  {t.classCode && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CLASS_DOT[t.classCode.toUpperCase()] ?? "bg-gray-400"}`} />}
                  <span className="flex-1 text-sm text-ink">{t.termName}</span>
                  <span className="text-[11px] text-muted">{t.domainName}</span>
                  {t.isPii && <span className="text-[10px] font-bold text-red-600 border border-red-200 rounded px-1">PII</span>}
                  {isSel && !singleSelect && <svg className="w-3.5 h-3.5 text-brand-purple shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              );
            })
        )}
      </div>
    </div>
  );
}

// ── Term chip ───────────────────────────────────────────────────────────────

function TermChip({ term, onRemove }: { term: LinkedTerm; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple/10 text-brand-deep border border-brand-purple/20">
      {term.termName}
      {term.isPii && <span className="text-[9px] font-bold text-red-600 ml-0.5">PII</span>}
      <button type="button" onClick={onRemove} className="hover:opacity-70 leading-none text-[13px] ml-0.5">&times;</button>
    </span>
  );
}

// ── Single-mode picker (original behaviour) ─────────────────────────────────

function SingleTermPicker({
  assetType, assetId,
}: {
  assetType: string; assetId: number;
}) {
  const { t: strings } = useLang();
  const c = strings.catalog;

  const [domains,      setDomains]      = useState<GlossaryPickerDomain[]>([]);
  const [selected,     setSelected]     = useState<LinkedTerm[]>([]);
  const [open,         setOpen]         = useState(false);
  const [activeDomain, setActiveDomain] = useState<GlossaryPickerDomain | null>(null);
  const [search,       setSearch]       = useState("");
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/glossary/picker").then((r) => r.ok ? r.json() : []),
      fetch(`/api/assets/${assetType}/${assetId}/terms`).then((r) => r.ok ? r.json() : []),
    ]).then(([d, current]) => {
      setDomains(d);
      setSelected(current);
      setLoading(false);
    });
  }, [assetType, assetId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function toggle(term: GlossaryPickerDomain["terms"][0], domainName: string) {
    const exists = selected.some((s) => s.glossaryId === term.glossaryId);
    const next = exists
      ? selected.filter((s) => s.glossaryId !== term.glossaryId)
      : [...selected, { glossaryId: term.glossaryId, termName: term.termName, domainName, isPii: term.isPii, termRole: "ENRICHMENT" as const }];
    setSelected(next);
    setSaving(true);
    await fetch(`/api/assets/${assetType}/${assetId}/terms`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ glossaryIds: next.map((t) => t.glossaryId) }),
    });
    setSaving(false);
  }

  if (loading) return <div className="text-[11px] text-muted">{c.loadingTerms}</div>;

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap gap-1.5 min-h-[34px] px-2.5 py-1.5 border border-line rounded-md bg-white cursor-pointer hover:border-brand-purple/60 transition-colors"
        onClick={() => { setOpen((v) => !v); setSearch(""); setActiveDomain(null); }}
      >
        {selected.length === 0 && <span className="text-muted text-[13px] self-center">{c.linkTerms}</span>}
        {selected.map((t) => {
          const d = domains.find((d) => d.terms.some((tt) => tt.glossaryId === t.glossaryId));
          const term = d?.terms.find((tt) => tt.glossaryId === t.glossaryId);
          return (
            <TermChip key={t.glossaryId} term={t} onRemove={() => { if (d && term) toggle(term, d.domainName); }} />
          );
        })}
        {saving && <span className="text-[11px] text-muted self-center ml-1">{strings.common.saving}</span>}
      </div>
      {open && (
        <TermDropdown
          domains={domains} search={search} onSearch={setSearch}
          onSelect={(term, dn) => { toggle(term, dn); setOpen(false); setSearch(""); setActiveDomain(null); }}
          onBack={() => setActiveDomain(null)}
          activeDomain={activeDomain} onSetDomain={setActiveDomain}
          selectedIds={new Set(selected.map((t) => t.glossaryId))}
          singleSelect={false}
        />
      )}
    </div>
  );
}

// ── Dual-mode picker (column: classification + enrichment) ──────────────────

function DualTermPicker({
  assetType, assetId,
}: {
  assetType: string; assetId: number;
}) {
  const { t: strings } = useLang();

  const [domains,      setDomains]      = useState<GlossaryPickerDomain[]>([]);
  const [classification, setClassification] = useState<LinkedTerm | null>(null);
  const [enrichment,   setEnrichment]   = useState<LinkedTerm[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [openSlot,     setOpenSlot]     = useState<"classification" | "enrichment" | null>(null);
  const [activeDomain, setActiveDomain] = useState<GlossaryPickerDomain | null>(null);
  const [search,       setSearch]       = useState("");

  const classRef = useRef<HTMLDivElement>(null);
  const enrichRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/glossary/picker").then((r) => r.ok ? r.json() : []),
      fetch(`/api/assets/${assetType}/${assetId}/terms`).then((r) => r.ok ? r.json() : []),
    ]).then(([d, current]: [GlossaryPickerDomain[], LinkedTerm[]]) => {
      setDomains(d);
      setClassification(current.find((t) => t.termRole === "CLASSIFICATION") ?? null);
      setEnrichment(current.filter((t) => t.termRole === "ENRICHMENT"));
      setLoading(false);
    });
  }, [assetType, assetId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const insideClass   = classRef.current?.contains(target);
      const insideEnrich  = enrichRef.current?.contains(target);
      if (!insideClass && !insideEnrich) setOpenSlot(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function save(cls: LinkedTerm | null, enr: LinkedTerm[]) {
    setSaving(true);
    await fetch(`/api/assets/${assetType}/${assetId}/terms`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classificationId: cls?.glossaryId ?? null,
        enrichmentIds:    enr.map((t) => t.glossaryId),
      }),
    });
    setSaving(false);
  }

  function openPicker(slot: "classification" | "enrichment") {
    setOpenSlot((prev) => prev === slot ? null : slot);
    setSearch(""); setActiveDomain(null);
  }

  async function selectClassification(term: GlossaryPickerDomain["terms"][0], domainName: string) {
    const next: LinkedTerm = { glossaryId: term.glossaryId, termName: term.termName, domainName, isPii: term.isPii, termRole: "CLASSIFICATION" };
    setClassification(next);
    setOpenSlot(null);
    await save(next, enrichment);
  }

  async function clearClassification() {
    setClassification(null);
    await save(null, enrichment);
  }

  async function toggleEnrichment(term: GlossaryPickerDomain["terms"][0], domainName: string) {
    const exists = enrichment.some((t) => t.glossaryId === term.glossaryId);
    const next = exists
      ? enrichment.filter((t) => t.glossaryId !== term.glossaryId)
      : [...enrichment, { glossaryId: term.glossaryId, termName: term.termName, domainName, isPii: term.isPii, termRole: "ENRICHMENT" as const }];
    setEnrichment(next);
    await save(classification, next);
  }

  if (loading) return <div className="text-[11px] text-muted">{strings.catalog.loadingTerms}</div>;

  return (
    <div className="space-y-3">
      {/* Classification slot */}
      <div ref={classRef} className="relative">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-purple">Classification</span>
          <span className="text-[10px] text-muted">(one term)</span>
        </div>
        <div
          className="flex flex-wrap gap-1.5 min-h-[34px] px-2.5 py-1.5 border border-line rounded-md bg-white cursor-pointer hover:border-brand-purple/60 transition-colors"
          onClick={() => openPicker("classification")}
        >
          {!classification && (
            <span className="text-muted text-[13px] self-center">Pick a classification term…</span>
          )}
          {classification && (
            <TermChip term={classification} onRemove={(e?: React.MouseEvent) => { e?.stopPropagation?.(); clearClassification(); }} />
          )}
          {saving && <span className="text-[11px] text-muted self-center ml-1">{strings.common.saving}</span>}
        </div>
        {openSlot === "classification" && (
          <TermDropdown
            domains={domains} search={search} onSearch={setSearch}
            onSelect={selectClassification}
            onBack={() => setActiveDomain(null)}
            activeDomain={activeDomain} onSetDomain={setActiveDomain}
            selectedIds={classification ? new Set([classification.glossaryId]) : new Set()}
            singleSelect={true}
          />
        )}
      </div>

      {/* Enrichment slot */}
      <div ref={enrichRef} className="relative">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Context Enrichment</span>
          <span className="text-[10px] text-muted">(multiple terms)</span>
        </div>
        <div
          className="flex flex-wrap gap-1.5 min-h-[34px] px-2.5 py-1.5 border border-line rounded-md bg-white cursor-pointer hover:border-brand-purple/60 transition-colors"
          onClick={() => openPicker("enrichment")}
        >
          {enrichment.length === 0 && (
            <span className="text-muted text-[13px] self-center">Link enrichment terms…</span>
          )}
          {enrichment.map((t) => {
            const d = domains.find((d) => d.terms.some((tt) => tt.glossaryId === t.glossaryId));
            const term = d?.terms.find((tt) => tt.glossaryId === t.glossaryId);
            return (
              <TermChip key={t.glossaryId} term={t} onRemove={() => { if (d && term) toggleEnrichment(term, d.domainName); }} />
            );
          })}
          {saving && <span className="text-[11px] text-muted self-center ml-1">{strings.common.saving}</span>}
        </div>
        {openSlot === "enrichment" && (
          <TermDropdown
            domains={domains} search={search} onSearch={setSearch}
            onSelect={(term, dn) => toggleEnrichment(term, dn)}
            onBack={() => setActiveDomain(null)}
            activeDomain={activeDomain} onSetDomain={setActiveDomain}
            selectedIds={new Set(enrichment.map((t) => t.glossaryId))}
            singleSelect={false}
          />
        )}
      </div>
    </div>
  );
}

// ── Public component ────────────────────────────────────────────────────────

export function TermMultiPicker({
  assetType,
  assetId,
  dual = false,
}: {
  assetType: string;
  assetId:   number;
  dual?:     boolean;
}) {
  if (dual) return <DualTermPicker assetType={assetType} assetId={assetId} />;
  return <SingleTermPicker assetType={assetType} assetId={assetId} />;
}
