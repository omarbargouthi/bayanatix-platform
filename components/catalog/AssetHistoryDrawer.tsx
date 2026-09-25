"use client";

import { useState, useEffect } from "react";
import type { AuditEntry } from "@/lib/types";
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";

function buildFieldLabel(c: I18nStrings["catalog"]): Record<string, string> {
  return {
    description_text:     c.fieldDescription,
    friendly_name_text:   c.fieldFriendlyName,
    is_encrypted:         c.fieldEncrypted,
    attribute_class_code: c.fieldColumnType,
    glossary_term_text:   c.fieldBusinessTerm,
    entity_category_code: c.fieldTableType,
    definition_text:      c.fieldDefinition,
    format_text:          c.fieldFormat,
    business_rules_text:  c.fieldBusinessRules,
    classification_code:  c.fieldClassification,
    is_pii_indicator:     c.fieldPiiFlag,
    pi_category_code:     c.fieldPiCategory,
    example_text:         c.fieldExample,
    term_type:            c.fieldTermType,
    business_app_name:    c.fieldBusinessApplication,
    schema_name_text:     c.fieldSchemaName,
    source_name_text:     c.fieldSourceName,
  };
}

function timeAgo(iso: string, t: I18nStrings) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return t.common.justNow;
  if (m < 60) return t.common.minutesAgo.replace("{n}", String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t.common.hoursAgo.replace("{n}", String(h));
  const d = Math.floor(h / 24);
  return d === 1 ? t.common.yesterday : t.common.daysAgo.replace("{n}", String(d));
}

interface Props {
  assetType: string;
  assetId:   number;
  assetName: string;
  onClose:   () => void;
}

export function AssetHistoryDrawer({ assetType, assetId, assetName, onClose }: Props) {
  const { t } = useLang();
  const c = t.catalog;
  const FIELD_LABEL = buildFieldLabel(c);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/catalog/history?assetType=${encodeURIComponent(assetType)}&assetId=${assetId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
        else setError(data.error ?? c.historyLoadFailed);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [assetType, assetId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white shadow-2xl border-l border-line flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-bold text-brand-deep">{c.changeHistoryTitle}</h2>
            <p className="text-[11px] text-muted mt-0.5">{assetName}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted text-sm">{t.common.loading}</div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {c.noChangesYet}
            </div>
          )}
          {!loading && entries.length > 0 && (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-line-soft" />
              <div className="space-y-5">
                {entries.map((entry) => {
                  const initials = (entry.userName ?? entry.userId)
                    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <div key={entry.auditId} className="relative pl-10">
                      {/* Avatar dot */}
                      <div className="absolute left-0 top-0.5 w-8 h-8 rounded-full bg-brand-purple/10 text-brand-purple text-[11px] font-bold grid place-items-center ring-2 ring-white">
                        {initials}
                      </div>
                      <div className="bg-canvas-soft border border-line-soft rounded-lg p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-semibold text-ink">
                            {entry.userName ?? entry.userId}
                          </span>
                          <span className="text-[11px] text-muted">{timeAgo(entry.timestamp, t)}</span>
                        </div>
                        {entry.changes.length === 0 ? (
                          <p className="text-[12px] text-muted italic">{c.noFieldDetails}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {entry.changes.map((c, i) => (
                              <div key={i} className="text-[12px]">
                                <span className="font-medium text-ink-soft">
                                  {FIELD_LABEL[c.field] ?? c.field}:
                                </span>
                                <div className="mt-0.5 grid grid-cols-2 gap-1.5">
                                  <div className="bg-red-50 border border-red-100 rounded px-2 py-1 text-red-700 line-through text-[11px] break-all">
                                    {c.from ?? <em className="not-italic text-muted">—</em>}
                                  </div>
                                  <div className="bg-emerald-50 border border-emerald-100 rounded px-2 py-1 text-emerald-700 text-[11px] break-all">
                                    {c.to ?? <em className="not-italic text-muted">—</em>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-muted mt-2 pt-1.5 border-t border-line-soft">
                          {new Date(entry.timestamp).toLocaleString("en-GB", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
