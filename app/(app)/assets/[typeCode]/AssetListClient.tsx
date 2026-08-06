"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PaginationBar } from "@/components/reports/DqDrillDownGrid";

type Attribute = { attrCode: string; attrNameText: string; dataTypeCode: string };
type Instance = { customAssetId: number; assetNameText: string; statusCode: string; attributes: Record<string, unknown> };

const PAGE_SIZE = 50;

function AssetListContent({ typeCode, typeName, isEnabled, canWrite }: { typeCode: string; typeName: string; isEnabled: boolean; canWrite: boolean }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    try {
      const r = await fetch(`/api/custom-assets/${typeCode}?${params.toString()}`);
      if (r.ok) {
        const data = await r.json();
        setAttributes(data.attributes);
        setInstances(data.instances);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [typeCode, search, page]);

  useEffect(() => { load(); }, [load]);

  function setSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("search", value); else params.delete("search");
    params.delete("page");
    router.push(`/assets/${typeCode}?${params.toString()}`);
  }

  function setPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`/assets/${typeCode}?${params.toString()}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {!isEnabled && (
        <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-3 py-2">
          This type is disabled — existing instances remain viewable but no new ones can be created.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-deep">{typeName}</h1>
        {canWrite && isEnabled && (
          <Link href={`/assets/${typeCode}/new`} className="btn btn-primary text-sm">+ New {typeName}</Link>
        )}
      </div>

      <input
        className="field-input max-w-xs"
        placeholder="Search…"
        defaultValue={search}
        onKeyDown={(e) => { if (e.key === "Enter") setSearch((e.target as HTMLInputElement).value); }}
      />

      <div className="card-padded">
        {loading ? (
          <div className="py-10 text-center text-muted">Loading…</div>
        ) : instances.length === 0 ? (
          <div className="py-10 text-center text-muted">No instances yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3">Name</th>
                  {attributes.map((a) => <th key={a.attrCode} className="py-2 pr-3">{a.attrNameText}</th>)}
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => (
                  <tr key={inst.customAssetId} className="border-b border-line-soft hover:bg-canvas">
                    <td className="py-2 pr-3">
                      <Link href={`/assets/${typeCode}/${inst.customAssetId}`} className="text-brand-purple hover:underline font-medium">
                        {inst.assetNameText}
                      </Link>
                    </td>
                    {attributes.map((a) => (
                      <td key={a.attrCode} className="py-2 pr-3 text-ink-soft">{String(inst.attributes?.[a.attrCode] ?? "—")}</td>
                    ))}
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inst.statusCode === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                        {inst.statusCode}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

export function AssetListClient(props: { typeCode: string; typeName: string; isEnabled: boolean; canWrite: boolean }) {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted">Loading…</div>}>
      <AssetListContent {...props} />
    </Suspense>
  );
}
