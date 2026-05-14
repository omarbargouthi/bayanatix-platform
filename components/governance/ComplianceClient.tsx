"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ComplianceFramework, ComplianceRequirement } from "@/lib/queries/gov-compliance";

type Props = {
  frameworks:          ComplianceFramework[];
  activeFramework:     ComplianceFramework | null;
  initialRequirements: ComplianceRequirement[];
};

const LEVELS = [
  { code: "NOT_ASSESSED",  label: "Not Assessed",   color: "bg-gray-100 text-gray-500",      dot: "bg-gray-400" },
  { code: "NON_COMPLIANT", label: "Non-Compliant",   color: "bg-red-100 text-red-700",        dot: "bg-red-500" },
  { code: "PARTIAL",       label: "Partial",          color: "bg-amber-100 text-amber-700",    dot: "bg-amber-500" },
  { code: "COMPLIANT",     label: "Compliant",        color: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500" },
];

export function ComplianceClient({ frameworks, activeFramework, initialRequirements }: Props) {
  const router = useRouter();
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>(initialRequirements);
  const [saving, setSaving]             = useState<number | null>(null);
  const [noteEdit, setNoteEdit]         = useState<number | null>(null);
  const [noteVal, setNoteVal]           = useState("");
  const [filter, setFilter]             = useState<string>("ALL");
  const [search, setSearch]             = useState("");

  const categories = useMemo(() => {
    const cats = new Set(requirements.map((r) => r.category ?? "Other"));
    return Array.from(cats).sort();
  }, [requirements]);

  const filtered = useMemo(() => {
    return requirements.filter((r) => {
      if (filter !== "ALL" && r.levelCode !== filter) return false;
      if (search && !r.reqText.toLowerCase().includes(search.toLowerCase()) && !r.reqCode.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [requirements, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ComplianceRequirement[]>();
    for (const r of filtered) {
      const cat = r.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const stats = useMemo(() => {
    const total    = requirements.length;
    const assessed = requirements.filter((r) => r.levelCode !== "NOT_ASSESSED").length;
    const compliant = requirements.filter((r) => r.levelCode === "COMPLIANT").length;
    const partial   = requirements.filter((r) => r.levelCode === "PARTIAL").length;
    const nonComp   = requirements.filter((r) => r.levelCode === "NON_COMPLIANT").length;
    return { total, assessed, compliant, partial, nonComp, pct: Math.round((compliant / Math.max(total, 1)) * 100) };
  }, [requirements]);

  async function setLevel(req: ComplianceRequirement, levelCode: string) {
    setSaving(req.reqId);
    await fetch(`/api/governance/compliance/${activeFramework?.frameworkId}/assess`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reqId: req.reqId, levelCode, notes: req.notes }),
    });
    setRequirements((p) => p.map((r) => r.reqId === req.reqId ? { ...r, levelCode } : r));
    setSaving(null);
  }

  async function saveNote(req: ComplianceRequirement) {
    await fetch(`/api/governance/compliance/${activeFramework?.frameworkId}/assess`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reqId: req.reqId, levelCode: req.levelCode, notes: noteVal }),
    });
    setRequirements((p) => p.map((r) => r.reqId === req.reqId ? { ...r, notes: noteVal } : r));
    setNoteEdit(null);
  }

  async function uploadEvidence(req: ComplianceRequirement, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("reqId", String(req.reqId));
    // Store filename optimistically
    setRequirements((p) => p.map((r) => r.reqId === req.reqId ? { ...r, evidenceName: file.name } : r));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">Compliance Assessment</h1>
          <p className="text-sm text-ink-soft mt-0.5">{activeFramework?.name} · {activeFramework?.version}</p>
        </div>
        {frameworks.length > 1 && (
          <select
            value={activeFramework?.frameworkId ?? ""}
            onChange={(e) => router.push(`/governance/compliance?fw=${e.target.value}`)}
            className="field w-auto"
          >
            {frameworks.map((f) => <option key={f.frameworkId} value={f.frameworkId}>{f.name}</option>)}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatBadge label="Total Requirements" value={stats.total}    color="text-ink" />
        <StatBadge label="Assessed"           value={stats.assessed}  color="text-brand-purple" />
        <StatBadge label="Compliant"          value={stats.compliant} color="text-emerald-600" />
        <StatBadge label="Partial"            value={stats.partial}   color="text-amber-600" />
        <StatBadge label="Non-Compliant"      value={stats.nonComp}   color="text-red-600" />
      </div>

      {/* Progress bar */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-ink">Overall Compliance</span>
          <span className="text-sm font-bold text-emerald-600">{stats.pct}%</span>
        </div>
        <div className="h-3 bg-canvas rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.round((stats.compliant / Math.max(stats.total, 1)) * 100)}%` }} />
          <div className="bg-amber-400 h-full transition-all" style={{ width: `${Math.round((stats.partial / Math.max(stats.total, 1)) * 100)}%` }} />
          <div className="bg-red-400 h-full transition-all" style={{ width: `${Math.round((stats.nonComp / Math.max(stats.total, 1)) * 100)}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>Compliant</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>Partial</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Non-Compliant</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block"/>Not Assessed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requirements…" className="field w-64" />
        <div className="flex gap-1">
          {["ALL", ...LEVELS.map((l) => l.code)].map((code) => (
            <button key={code} onClick={() => setFilter(code)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${filter === code ? "bg-brand-purple text-white border-brand-purple" : "border-line text-ink-soft hover:border-brand-purple hover:text-brand-purple"}`}>
              {code === "ALL" ? "All" : LEVELS.find((l) => l.code === code)?.label ?? code}
            </button>
          ))}
        </div>
      </div>

      {/* Requirements grouped by category */}
      <div className="space-y-4">
        {grouped.map(([category, reqs]) => (
          <div key={category} className="card overflow-hidden">
            <div className="bg-canvas-soft px-5 py-3 border-b border-line flex items-center justify-between">
              <h3 className="font-bold text-sm text-brand-deep">{category}</h3>
              <span className="text-[11px] text-muted">{reqs.length} requirement{reqs.length !== 1 ? "s" : ""}</span>
            </div>
            <table className="w-full text-sm">
              <colgroup>
                <col className="w-24" />
                <col />
                <col className="w-40" />
                <col className="w-32" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b border-line-soft text-left bg-white">
                  <th className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Code</th>
                  <th className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Requirement</th>
                  <th className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Compliance Level</th>
                  <th className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Notes</th>
                  <th className="px-4 py-2 text-[10px] uppercase tracking-wide text-muted font-semibold">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((req) => {
                  const lvl = LEVELS.find((l) => l.code === req.levelCode) ?? LEVELS[0];
                  return (
                    <tr key={req.reqId} className="border-b border-line-soft hover:bg-canvas/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] text-brand-purple font-bold whitespace-nowrap">{req.reqCode}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-ink">{req.reqText}</div>
                        {req.guidance && <div className="text-[11px] text-muted mt-0.5">{req.guidance}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={req.levelCode}
                          disabled={saving === req.reqId}
                          onChange={(e) => setLevel(req, e.target.value)}
                          className={`text-[11px] font-semibold px-2 py-1 rounded-md border-0 cursor-pointer ${lvl.color}`}
                        >
                          {LEVELS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {noteEdit === req.reqId ? (
                          <div className="flex items-center gap-1">
                            <input value={noteVal} onChange={(e) => setNoteVal(e.target.value)} className="field text-[11px] py-0.5 px-1.5 w-full" autoFocus />
                            <button onClick={() => saveNote(req)} className="text-[10px] text-emerald-600 font-bold whitespace-nowrap">Save</button>
                          </div>
                        ) : (
                          <button onClick={() => { setNoteEdit(req.reqId); setNoteVal(req.notes ?? ""); }}
                            className="text-[11px] text-left text-muted hover:text-ink transition-colors max-w-[120px] truncate block">
                            {req.notes || <span className="text-muted/50 italic">Add note…</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <label className="cursor-pointer text-[11px] text-brand-purple hover:underline relative">
                          {req.evidenceName ? (
                            <span className="truncate max-w-[100px] block" title={req.evidenceName}>{req.evidenceName}</span>
                          ) : (
                            <span className="text-muted/70 italic">Upload…</span>
                          )}
                          <input type="file" className="absolute inset-0 opacity-0 w-full cursor-pointer"
                            onChange={(e) => e.target.files?.[0] && uploadEvidence(req, e.target.files[0])} />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-xl font-extrabold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
