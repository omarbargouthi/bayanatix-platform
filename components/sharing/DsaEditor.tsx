"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS, STATUS_COLORS, SCOPE_LABELS } from "@/lib/sharing-routing";
import type { DsaDetail, DsaDataset, DsaApproval, DsaAuthorization } from "@/lib/queries/sharing";
import { DsaGeneralTab }    from "./tabs/DsaGeneralTab";
import { DsaDatasetsTab }   from "./tabs/DsaDatasetsTab";
import { DsaTermsTab }      from "./tabs/DsaTermsTab";
import { DsaApprovalsTab }  from "./tabs/DsaApprovalsTab";
import { DsaAuthorizationsTab } from "./tabs/DsaAuthorizationsTab";

type Tab = "general" | "datasets" | "terms" | "authorizations" | "approvals";

const TABS: { key: Tab; label: string }[] = [
  { key: "general",        label: "General" },
  { key: "datasets",       label: "Datasets & Attributes" },
  { key: "terms",          label: "Terms & Controls" },
  { key: "authorizations", label: "Privacy & Authorization" },
  { key: "approvals",      label: "Approvals" },
];

type LoadedDsa = {
  dsa:            DsaDetail;
  datasets:       DsaDataset[];
  approvals:      DsaApproval[];
  authorizations: DsaAuthorization[];
};

export function DsaEditor({ dsaId }: { dsaId: number | null }) {
  const router = useRouter();
  const [tab, setTab]         = useState<Tab>("general");
  const [data, setData]       = useState<LoadedDsa | null>(null);
  const [loading, setLoading] = useState(dsaId !== null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; failures?: string[] } | null>(null);

  const load = useCallback(async () => {
    if (!dsaId) return;
    setLoading(true);
    const r = await fetch(`/api/sharing/dsas/${dsaId}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, [dsaId]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit() {
    if (!dsaId) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const r = await fetch(`/api/sharing/dsas/${dsaId}/submit`, { method: "POST" });
      const text = await r.text();
      const result = text ? JSON.parse(text) : { ok: false, failures: [`Server error (HTTP ${r.status})`] };
      setSubmitResult(result);
      if (result.ok) load();
    } catch (e) {
      setSubmitResult({ ok: false, failures: ["Unexpected error — check the browser console."] });
    } finally {
      setSubmitting(false);
    }
  }

  const dsa = data?.dsa;
  const isDraft = !dsa || ["DRAFT","RENEWAL_DRAFT"].includes(dsa.statusCode);
  const isEditable = isDraft;

  if (loading) return <div className="p-8 text-muted">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-0 flex items-start justify-between border-b border-line bg-white">
        <div className="pb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/sharing")} className="text-muted hover:text-ink text-sm">← Agreements</button>
            {dsa?.dsaReferenceCode && (
              <span className="font-mono text-[11px] text-brand-purple">{dsa.dsaReferenceCode}</span>
            )}
            {dsa && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[dsa.statusCode] ?? "bg-gray-100 text-gray-500"}`}>
                {STATUS_LABELS[dsa.statusCode] ?? dsa.statusCode}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-ink mt-1">
            {dsa?.titleText ?? "New Agreement"}
          </h1>
          {dsa && (
            <div className="flex items-center gap-4 mt-1 text-xs text-muted">
              <span>{SCOPE_LABELS[dsa.sharingScopeCode] ?? dsa.sharingScopeCode}</span>
              {dsa.counterpartyNameText && <span>→ {dsa.counterpartyNameText}</span>}
              {dsa.effectiveEndDate && <span>Expires {dsa.effectiveEndDate}</span>}
              {dsa.containsPersonalData && (
                <span className="text-purple-600 font-medium">Contains Personal Data</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pb-4">
          {isEditable && dsa && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? "Validating…" : "Submit for Approval"}
            </button>
          )}
        </div>
      </div>

      {/* ── Submit result banner ─────────────────────────────────────── */}
      {submitResult && !submitResult.ok && (
        <div className="mx-8 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="font-semibold text-red-700 text-sm mb-2">Readiness check failed — resolve before submitting:</div>
          <ul className="list-disc list-inside space-y-1">
            {submitResult.failures?.map((f, i) => (
              <li key={i} className="text-sm text-red-600">{f}</li>
            ))}
          </ul>
        </div>
      )}
      {submitResult?.ok && (
        <div className="mx-8 mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
          ��� Submitted successfully. Agreement moved to Owner Review.
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="px-8 bg-white border-b border-line">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-brand-purple text-brand-purple"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8">
        {tab === "general" && (
          <DsaGeneralTab
            dsaId={dsaId}
            dsa={dsa ?? null}
            isEditable={isEditable}
            onSaved={load}
          />
        )}
        {tab === "datasets" && dsaId && (
          <DsaDatasetsTab
            dsaId={dsaId}
            datasets={data?.datasets ?? []}
            isEditable={isEditable}
            onChanged={load}
          />
        )}
        {tab === "terms" && (
          <DsaTermsTab
            dsaId={dsaId}
            dsa={dsa ?? null}
            isEditable={isEditable}
            onSaved={load}
          />
        )}
        {tab === "authorizations" && dsaId && (
          <DsaAuthorizationsTab
            dsaId={dsaId}
            dsa={dsa ?? null}
            authorizations={data?.authorizations ?? []}
            isEditable={isEditable}
            onChanged={load}
          />
        )}
        {tab === "approvals" && dsaId && (
          <DsaApprovalsTab
            dsaId={dsaId}
            approvals={data?.approvals ?? []}
            dsa={dsa ?? null}
            onChanged={load}
          />
        )}
      </div>
    </div>
  );
}
