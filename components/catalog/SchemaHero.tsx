"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { IconDB, IconHistory, IconCollaborate } from "@/components/layout/icons";
import { AssetHistoryDrawer } from "./AssetHistoryDrawer";
import { TagPicker } from "./TagPicker";
import { TermMultiPicker } from "./TermMultiPicker";
import { StarRatingWidget } from "./StarRatingWidget";
import { CertifyAssetModal } from "./CertifyAssetModal";
import { useLang } from "@/lib/lang-context";
import type { DataSchema, DataSource } from "@/lib/types";

interface Props {
  schema:    DataSchema & { source: DataSource | null };
  tables:    number;
  views:     number;
  totalCols: number;
  canEdit:   boolean;
}

export function SchemaHero({ schema, tables, views, totalCols, canEdit }: Props) {
  const router = useRouter();
  const { t } = useLang();
  const c = t.catalog;
  const [editing,     setEditing]     = useState(false);
  const [desc,        setDesc]        = useState(schema.description ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showHistory,  setShowHistory]  = useState(false);
  const [showCertify,  setShowCertify]  = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalog/schemas/${schema.schemaId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description: desc }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: "Unknown error" }));
        setError(d.error ?? "Failed to save");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-6 mb-6">
        {/* Top bar: tags + action icons */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag variant="green">Certified</Tag>
            <Tag variant="purple">Finance</Tag>
            {schema.source && (
              <Tag>{schema.source.sourceName}</Tag>
            )}
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                onClick={() => setShowCertify(true)}
                className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-white/60 hover:text-amber-600 transition-colors"
                title="Certify schema"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowHistory(true)}
              className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-white/60 hover:text-brand-purple transition-colors"
              title="Change history"
            >
              <IconHistory className="w-4 h-4" />
            </button>
            <Link
              href="/collaboration"
              className="w-8 h-8 grid place-items-center rounded-lg text-ink-soft hover:bg-white/60 hover:text-brand-purple transition-colors"
              title="Collaboration threads"
            >
              <IconCollaborate className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Main content: schema info + stat tiles */}
        <div className="grid grid-cols-[1fr_148px_148px] gap-5 items-start">

          {/* Schema info */}
          <div>
            <h2 className="text-2xl font-extrabold text-brand-deep flex items-center gap-2.5 mb-1">
              <IconDB className="w-6 h-6 text-brand-purple shrink-0" />
              {schema.schemaName}
            </h2>

            {editing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm border border-line rounded-lg focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 resize-none bg-white"
                  placeholder="Describe this schema…"
                />
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(false); setDesc(schema.description ?? ""); }} className="btn btn-sm">{t.common.cancel}</button>
                  <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
                    {saving ? t.common.saving : t.common.save}
                  </button>
                </div>
              </div>
            ) : (
              <div className="group flex items-start gap-2 mt-2">
                <p className="text-sm text-ink-soft leading-relaxed flex-1">
                  {schema.description || <span className="italic text-muted">{c.noDescSchema}</span>}
                </p>
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 w-6 h-6 grid place-items-center rounded hover:bg-brand-purple/10 text-muted hover:text-brand-purple transition-all"
                    title="Edit description"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {schema.source && (
                <Tag>DB: <strong className="ml-1">{schema.source.databaseName}</strong></Tag>
              )}
              {schema.ownerUserId && (
                <Tag>Owner: <strong className="ml-1">{schema.ownerUserId}</strong></Tag>
              )}
              <Tag>Columns: <strong className="ml-1">{totalCols.toLocaleString()}</strong></Tag>
              <Tag>Views: <strong className="ml-1">{views}</strong></Tag>
              <Tag variant="amber">Updated 2h ago</Tag>
            </div>
          </div>

          {/* CDEs tile */}
          <div className="bg-white/70 border border-white rounded-xl px-5 py-4 text-center shadow-sm">
            <div className="text-3xl font-extrabold text-brand-purple leading-none mb-1">
              {(schema.cdeCount ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{c.cdes}</div>
            <div className="text-[11px] text-muted mt-1">{c.businessLinked}</div>
          </div>

          {/* Tables tile */}
          <div className="bg-white/70 border border-white rounded-xl px-5 py-4 text-center shadow-sm">
            <div className="text-3xl font-extrabold text-brand-deep leading-none mb-1">
              {tables.toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{c.tables}</div>
            <div className="text-[11px] text-muted mt-1">{c.inThisSchema}</div>
          </div>
        </div>
      </div>

      {/* Tags / Terms / Rating row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card px-4 py-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">{c.tagsLabel}</h4>
          <TagPicker assetType="DATA_SCHEMAS" assetId={schema.schemaId} />
        </div>
        <div className="card px-4 py-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">{c.businessTerms}</h4>
          <TermMultiPicker assetType="DATA_SCHEMAS" assetId={schema.schemaId} />
        </div>
        <div className="card px-4 py-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">{c.ratingLabel}</h4>
          <StarRatingWidget assetType="DATA_SCHEMAS" assetId={schema.schemaId} />
        </div>
      </div>

      {showHistory && (
        <AssetHistoryDrawer
          assetType="DATA_SCHEMAS"
          assetId={schema.schemaId}
          assetName={schema.schemaName}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showCertify && (
        <CertifyAssetModal
          assetType="DATA_SCHEMAS"
          assetId={schema.schemaId}
          assetName={schema.schemaName}
          onClose={() => setShowCertify(false)}
        />
      )}
    </>
  );
}
