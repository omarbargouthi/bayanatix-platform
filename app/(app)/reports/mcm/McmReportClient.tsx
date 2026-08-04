"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BusinessDomain, SourceLite, UserLite, McmReportData, McmGapRow } from "@/lib/queries/reports";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { KpiCard } from "@/components/reports/KpiCard";
import { TrendChart } from "@/components/reports/TrendChart";
import { DrillDownGrid, type GridColumn } from "@/components/reports/DrillDownGrid";

const PAGE_SIZE = 25;

const COLUMNS: GridColumn<McmGapRow>[] = [
  { key: "entityName", label: "Table" },
  { key: "sourceName", label: "Source" },
  { key: "domainName", label: "Domain" },
  { key: "hasOwner", label: "Owner", render: (r) => (r.hasOwner ? "Yes" : "No") },
  { key: "missingDescCount", label: "Missing Descriptions" },
  { key: "unlinkedColumnCount", label: "Unlinked Columns" },
];

function McmReportContent({
  domains, sources, owners, isAdmin, domainLocked,
}: {
  domains: BusinessDomain[];
  sources: SourceLite[];
  owners: UserLite[];
  isAdmin: boolean;
  domainLocked?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const domainId = searchParams.get("domain") ?? "";
  const sourceId = searchParams.get("source") ?? "";
  const ownerId = searchParams.get("owner") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const [data, setData] = useState<McmReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domainId) params.set("domain", domainId);
    if (sourceId) params.set("source", sourceId);
    if (ownerId) params.set("owner", ownerId);
    params.set("page", String(page));
    try {
      const r = await fetch(`/api/reports/mcm?${params.toString()}`);
      if (r.ok) setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [domainId, sourceId, ownerId, page]);

  useEffect(() => { load(); }, [load]);

  function setParam(key: "domain" | "source" | "owner", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    router.push(`/reports/mcm?${params.toString()}`);
  }

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`/reports/mcm?${params.toString()}`);
  }

  async function captureSnapshot() {
    setCapturing(true);
    try {
      await fetch("/api/reports/R1_MCM/snapshot", { method: "POST" });
      await load();
    } finally {
      setCapturing(false);
    }
  }

  const exportParams = new URLSearchParams();
  if (domainId) exportParams.set("domain", domainId);
  if (sourceId) exportParams.set("source", sourceId);
  if (ownerId) exportParams.set("owner", ownerId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-deep">Data Catalog / Metadata Report</h1>
          <p className="text-xs text-muted mt-0.5">R1 — MCM monitoring KPIs</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={captureSnapshot} disabled={capturing} className="text-sm px-3 py-2 rounded-lg border border-line bg-white hover:bg-canvas disabled:opacity-50">
              {capturing ? "Capturing…" : "Capture Snapshot"}
            </button>
          )}
          <a href={`/api/reports/R1_MCM/export?${exportParams.toString()}`} className="text-sm px-3 py-2 rounded-lg bg-brand-purple text-white hover:bg-brand-violet">Export XLSX</a>
          <a href={`/api/reports/R1_MCM/export-pdf?${exportParams.toString()}`} className="text-sm px-3 py-2 rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/5">Export PDF</a>
        </div>
      </div>

      <ReportFilterBar domains={domains} sources={sources} owners={owners} domainId={domainId} sourceId={sourceId} ownerId={ownerId} onChange={setParam} domainLocked={domainLocked} />

      {loading && !data ? (
        <div className="py-20 text-center text-muted">Loading…</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.kpis.map((k) => <KpiCard key={k.kpiCode} kpi={k} />)}
          </div>
          <div className="card-padded">
            <div className="text-sm font-semibold text-ink mb-2">12-Month Trend</div>
            <TrendChart data={data.trend} target={data.kpis[0]?.targetValue ?? null} />
          </div>
          <div className="card-padded">
            <div className="text-sm font-semibold text-ink mb-3">Catalog Gaps</div>
            <DrillDownGrid
              columns={COLUMNS} rows={data.drillDown} total={data.total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage}
              rowKey={(r) => r.entityId} linkHref={(r) => `/catalog/${r.schemaId}/tables/${r.entityId}`}
              emptyMessage="No catalog gaps in scope — every table has an owner and fully described, term-linked columns."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function McmReportClient(props: { domains: BusinessDomain[]; sources: SourceLite[]; owners: UserLite[]; isAdmin: boolean; domainLocked?: boolean }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted">Loading…</div>}>
      <McmReportContent {...props} />
    </Suspense>
  );
}
