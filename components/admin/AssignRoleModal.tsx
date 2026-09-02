"use client";

import { useState } from "react";
import type { Role, SourceOption, SchemaOption, TableOption } from "@/lib/types";

type Props = {
  roles:       Role[];
  sources:     SourceOption[];
  schemas:     SchemaOption[];
  tables:      TableOption[];
  userId?:     string;
  teamId?:     number;
  onDone:      () => void;
  onClose:     () => void;
};

const RESOURCE_TYPES = [
  { value: "GLOBAL",      label: "Global (all assets)" },
  { value: "DATA_SOURCE", label: "Data Source" },
  { value: "SCHEMA",      label: "Schema" },
  { value: "TABLE",       label: "Table" },
];

export function AssignRoleModal({ roles, sources, schemas, tables, userId, teamId, onDone, onClose }: Props) {
  const [roleId,         setRoleId]         = useState<string>("");
  const [resType,        setResType]        = useState<string>("GLOBAL");
  // Scope-narrowing selections — Schema/Table scope needs Source (and Schema,
  // for Table) picked first so the final list can't mix same-named schemas or
  // tables from different sources without any indication of which is which.
  const [filterSourceId, setFilterSourceId] = useState<string>("");
  const [filterSchemaId, setFilterSchemaId] = useState<string>("");
  const [resId,          setResId]          = useState<string>("");
  const [saving,         setSaving]         = useState(false);
  const [err,            setErr]            = useState("");

  function changeResType(v: string) {
    setResType(v);
    setFilterSourceId("");
    setFilterSchemaId("");
    setResId("");
  }

  const schemasInSource = schemas.filter((s) => s.sourceId === filterSourceId);
  const tablesInSchema  = tables.filter((t) => t.schemaId === filterSchemaId);

  const resName =
    resType === "DATA_SOURCE" ? sources.find((r) => r.id === resId)?.name ?? "" :
    resType === "SCHEMA"      ? (() => { const s = schemas.find((r) => r.id === resId); return s ? `${s.sourceName} / ${s.name}` : ""; })() :
    resType === "TABLE"       ? (() => { const t = tables.find((r) => r.id === resId);  return t ? `${t.sourceName} / ${t.schemaName} / ${t.name}` : ""; })() :
    "Global";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleId) { setErr("Select a role."); return; }
    if (resType !== "GLOBAL" && !resId) { setErr("Select a resource."); return; }
    setSaving(true); setErr("");
    const res = await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId:       Number(roleId),
        userId:       userId ?? undefined,
        teamId:       teamId ?? undefined,
        resourceType: resType,
        resourceId:   resType === "GLOBAL" ? null : resId,
        resourceName: resType === "GLOBAL" ? "Global" : resName,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErr("Failed to assign role."); return; }
    onDone();
  }

  const selectClass = "w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] border border-line">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="font-bold text-brand-deep">Assign Role</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {err && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-md">{err}</p>}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Role *</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className={selectClass}
            >
              <option value="">— select role —</option>
              {roles.map((r) => (
                <option key={r.roleId} value={r.roleId}>{r.roleName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Scope *</label>
            <select
              value={resType}
              onChange={(e) => changeResType(e.target.value)}
              className={selectClass}
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {resType === "DATA_SOURCE" && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Data Source *</label>
              <select value={resId} onChange={(e) => setResId(e.target.value)} className={selectClass}>
                <option value="">— select —</option>
                {sources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {/* Schema/Table scope: Source picked first so the schema/table list below
              it is never an ambiguous flat list of same-named items from different
              sources — each step narrows the next. */}
          {(resType === "SCHEMA" || resType === "TABLE") && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Data Source *</label>
              <select
                value={filterSourceId}
                onChange={(e) => { setFilterSourceId(e.target.value); setFilterSchemaId(""); setResId(""); }}
                className={selectClass}
              >
                <option value="">— select source —</option>
                {sources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {resType === "SCHEMA" && filterSourceId && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Schema *</label>
              <select value={resId} onChange={(e) => setResId(e.target.value)} className={selectClass}>
                <option value="">— select schema —</option>
                {schemasInSource.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {resType === "TABLE" && filterSourceId && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Schema *</label>
              <select
                value={filterSchemaId}
                onChange={(e) => { setFilterSchemaId(e.target.value); setResId(""); }}
                className={selectClass}
              >
                <option value="">— select schema —</option>
                {schemasInSource.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {resType === "TABLE" && filterSchemaId && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1.5">Table *</label>
              <select value={resId} onChange={(e) => setResId(e.target.value)} className={selectClass}>
                <option value="">— select table —</option>
                {tablesInSchema.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {resId && resType !== "GLOBAL" && resType !== "DATA_SOURCE" && (
            <p className="text-[11px] text-muted">Scope: <span className="font-semibold text-ink-soft">{resName}</span></p>
          )}

          {/* Preview effective privileges */}
          {roleId && (() => {
            const r = roles.find((r) => String(r.roleId) === roleId);
            if (!r) return null;
            const privs = [
              r.isAdmin        && { label: "Admin",           color: "bg-purple-100 text-purple-700" },
              r.metadataRead   && { label: "Metadata Read",   color: "bg-blue-100 text-blue-700" },
              r.metadataWrite  && { label: "Metadata Write",  color: "bg-blue-100 text-blue-700" },
              r.metadataDelete && { label: "Metadata Delete", color: "bg-red-100 text-red-700" },
              r.dataRead       && { label: "Data Read",       color: "bg-emerald-100 text-emerald-700" },
            ].filter(Boolean) as { label: string; color: string }[];
            return (
              <div className="bg-canvas-soft rounded-md px-3 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Effective privileges</div>
                <div className="flex flex-wrap gap-1.5">
                  {privs.map((p) => (
                    <span key={p.label} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.color}`}>{p.label}</span>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
            <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? "Assigning…" : "Assign Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
