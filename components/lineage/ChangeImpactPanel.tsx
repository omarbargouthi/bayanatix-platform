"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { objectTypeLabels } from "./LineageNode";
import { PropagationPreview, type Preview } from "./PropagationPreview";

type AssetType = "DATA_ENTITIES" | "DATA_ATTRIBUTES";
type ImpactAsset = {
  depth: number; assetId: number; assetType: AssetType; name: string;
  parentEntityName: string | null; schemaName: string | null; objectTypeCode: string | null;
  ownerName: string | null; qualityStatus: string;
};
type ImpactReport = { levels: { depth: number; assets: ImpactAsset[] }[] };

const CHANGE_TYPES = ["RENAME", "DATA_TYPE", "REMOVE", "LOGIC", "VALUES", "OTHER"] as const;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const keyOf = (a: { assetType: string; assetId: number }) => `${a.assetType}:${a.assetId}`;

// "Assess a planned change": pick the table or one of its columns, see every
// downstream asset that depends on it (with owners), and raise review requests
// to the owners of the ones that need fixing/reviewing.
export function ChangeImpactPanel({
  entityId, entityName, initialColumnId, canManage, onClose,
}: {
  entityId: number; entityName: string; initialColumnId: number | null; canManage: boolean; onClose: () => void;
}) {
  const { t } = useLang();
  const lt = t.lineageTools;
  const types = objectTypeLabels(t.lineage);

  const [columns, setColumns] = useState<{ attributeId: number; name: string }[]>([]);
  const [columnId, setColumnId] = useState<number | null>(initialColumnId);
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [changeType, setChangeType] = useState<(typeof CHANGE_TYPES)[number]>("DATA_TYPE");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ created: { requestId: number; entityName: string; notified: number }[]; workflowMapped: boolean } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [planned, setPlanned] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch(`/api/lineage/entities/${entityId}/columns`).then((r) => (r.ok ? r.json() : [])).then(setColumns).catch(() => {});
  }, [entityId]);

  const focus = columnId != null ? { assetType: "DATA_ATTRIBUTES" as const, assetId: columnId } : { assetType: "DATA_ENTITIES" as const, assetId: entityId };

  useEffect(() => {
    setLoading(true); setCreated(null); setError(null);
    fetch(`/api/lineage/impact?assetType=${focus.assetType}&assetId=${focus.assetId}&direction=DOWN&maxDepth=10`)
      .then((r) => r.json())
      .then((rep: ImpactReport) => {
        setReport(rep);
        setSelected(new Set(rep.levels.flatMap((l) => l.assets).map(keyOf)));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.assetType, focus.assetId]);

  // One row per impacted asset (the same asset can appear via several paths — keep its nearest hop).
  const assets = useMemo(() => {
    const byKey = new Map<string, ImpactAsset>();
    for (const a of (report?.levels ?? []).flatMap((l) => l.assets)) {
      const prev = byKey.get(keyOf(a));
      if (!prev || a.depth < prev.depth) byKey.set(keyOf(a), a);
    }
    return [...byKey.values()].sort((a, b) => a.depth - b.depth);
  }, [report]);
  const owners = new Set(assets.filter((a) => selected.has(keyOf(a)) && a.ownerName).map((a) => a.ownerName));

  function toggle(k: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }

  // Classification changes the planned change would cause downstream, written into
  // the review requests so owners see them too.
  function propagationNote(): string {
    if (!preview || preview.changes.length === 0) return "";
    const pp = t.propagationPreview;
    const name = (x: { name: string } | null) => x?.name ?? pp.none;
    const lines = preview.changes.slice(0, 25).map((c) => `- ${c.entityName}.${c.columnName}: ${name(c.before)} → ${name(c.after)}`);
    if (preview.changes.length > 25) lines.push(`- … +${preview.changes.length - 25}`);
    return `\n\n${fill(pp.requestNote, { n: preview.changes.length })}:\n${lines.join("\n")}`;
  }

  // Excel of what the panel shows: the planned change, impacted assets (with the
  // current selection) and the propagation effects — for sharing outside Bayanis.
  async function exportExcel() {
    setExporting(true); setError(null);
    try {
      const r = await fetch("/api/lineage/change-impact/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...focus, changeType, priority, details, selected: [...selected], planned }),
      });
      if (!r.ok) { setError(t.impactExport.exportFailed); return; }
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "impact.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setExporting(false);
    }
  }

  async function raise() {
    setRaising(true); setError(null);
    try {
      const r = await fetch("/api/lineage/change-impact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...focus, changeType, description: (details + propagationNote()).trim(), priority,
          targets: assets.filter((a) => selected.has(keyOf(a))).map((a) => ({ assetType: a.assetType, assetId: a.assetId })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? lt.raiseFailed); return; }
      setCreated(d);
    } finally {
      setRaising(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-[640px] max-w-full h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="font-bold text-[15px] text-brand-deep">{lt.changeTitle}</h2>
            <p className="text-xs text-muted mt-0.5">{lt.changeDesc}</p>
          </div>
          <button onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 border-b border-line-soft grid grid-cols-2 gap-3 shrink-0">
          <div className="col-span-2">
            <label className="field-label">{lt.changeAsset}</label>
            <select className="input-field w-full" value={columnId ?? ""} onChange={(e) => setColumnId(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">{entityName} — {lt.wholeTable}</option>
              {columns.map((c) => <option key={c.attributeId} value={c.attributeId}>{entityName}.{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{lt.changeType}</label>
            <select className="input-field w-full" value={changeType} onChange={(e) => setChangeType(e.target.value as typeof changeType)}>
              {CHANGE_TYPES.map((c) => <option key={c} value={c}>{lt.changeTypes[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{lt.priority}</label>
            <select className="input-field w-full" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{lt.priorities[p]}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="field-label">{lt.changeDetails}</label>
            <textarea className="input-field w-full" rows={2} placeholder={lt.changeDetailsPh} value={details} onChange={(e) => setDetails(e.target.value)} dir="auto" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto nice-scroll">
          <PropagationPreview assetType={focus.assetType} assetId={focus.assetId} removing={changeType === "REMOVE"} onPreview={(p, plan) => { setPreview(p); setPlanned(plan); }} />
          {loading && <div className="py-12 text-center text-sm text-muted">{lt.loading}</div>}
          {!loading && assets.length === 0 && (
            <div className="m-5 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-3">{lt.noImpact}</div>
          )}
          {!loading && assets.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="text-[13px] font-semibold text-ink">
                  {lt.impactedAssets} <span className="text-muted font-normal">· {fill(lt.impactedCount, { n: selected.size, owners: owners.size })}</span>
                </div>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-soft cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-brand-purple"
                    checked={selected.size === assets.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(assets.map(keyOf)) : new Set())}
                  />
                  {lt.selectAll}
                </label>
              </div>
              <div className="mx-5 mb-5 border border-line rounded-lg overflow-hidden">
                <div className="grid grid-cols-[28px_1fr_52px_110px_130px] gap-2 px-3 py-2 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                  <div /><div>{lt.colAsset}</div><div>{lt.colHop}</div><div>{lt.colLayer}</div><div>{lt.colOwner}</div>
                </div>
                {assets.map((a) => {
                  const k = keyOf(a);
                  return (
                    <label key={k} className="grid grid-cols-[28px_1fr_52px_110px_130px] gap-2 px-3 py-2 border-b border-line-soft last:border-0 items-center text-[13px] cursor-pointer hover:bg-canvas-soft">
                      <input type="checkbox" className="accent-brand-purple" checked={selected.has(k)} onChange={() => toggle(k)} />
                      <div className="min-w-0">
                        <div className="text-ink truncate" dir="auto" title={a.assetType === "DATA_ATTRIBUTES" ? `${a.parentEntityName}.${a.name}` : a.name}>
                          {a.assetType === "DATA_ATTRIBUTES" ? `${a.parentEntityName}.${a.name}` : a.name}
                        </div>
                        {a.schemaName && <div className="text-[11px] text-muted truncate" dir="auto">{a.schemaName}</div>}
                      </div>
                      <div className="text-ink-soft">{a.depth}</div>
                      <div className="text-ink-soft truncate">{types[a.objectTypeCode ?? ""] ?? "—"}</div>
                      <div className={`truncate ${a.ownerName ? "text-ink-soft" : "text-amber-700"}`}>{a.ownerName ?? lt.noOwner}</div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line shrink-0 space-y-2">
          {created && (
            <div className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 space-y-1">
              <div>{fill(lt.raised, { n: created.created.length })}</div>
              {!created.workflowMapped && <div className="text-[12px] text-ink-soft">{fill(lt.raisedNoWorkflow, { n: created.created.reduce((s, c) => s + c.notified, 0) })}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {created.created.map((c) => (
                  <Link key={c.requestId} href={`/requests/${c.requestId}`} className="text-[12px] font-semibold text-brand-purple hover:underline">
                    #{c.requestId} {c.entityName}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {!canManage && assets.length > 0 && <p className="text-[12px] text-muted">{lt.viewOnlyNote}</p>}
          <div className="flex gap-2">
            <button onClick={exportExcel} disabled={exporting || loading} className="btn text-sm shrink-0">
              {exporting ? t.impactExport.exporting : t.impactExport.export}
            </button>
            {canManage && (
              <button onClick={raise} disabled={raising || selected.size === 0 || !!created} className="btn btn-primary flex-1 text-sm">
                {raising ? lt.raising : fill(lt.raiseRequests, { n: selected.size })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
