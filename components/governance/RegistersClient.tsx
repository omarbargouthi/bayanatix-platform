"use client";

import { useState } from "react";
import Link from "next/link";
import type { GovRegister } from "@/lib/queries/gov-registers";
import { useLang } from "@/lib/lang-context";
import { FormDialog, FormField } from "@/components/ui/FormDialog";

function fmtDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch { return iso; }
}

type Props = {
  initialRegisters:        GovRegister[];
  initialDeletedRegisters: GovRegister[];
  isAdmin:                 boolean;
};

export function RegistersClient({ initialRegisters, initialDeletedRegisters, isAdmin }: Props) {
  const { t } = useLang();
  const r = t.registers;

  const [registers,        setRegisters]        = useState<GovRegister[]>(initialRegisters);
  const [deletedRegisters, setDeletedRegisters] = useState<GovRegister[]>(initialDeletedRegisters);
  const [showArchived,     setShowArchived]     = useState(false);
  const [showModal,        setShowModal]        = useState(false);
  const [name,             setName]             = useState("");
  const [desc,             setDesc]             = useState("");
  const [saving,           setSaving]           = useState(false);

  // Delete confirmation modal state
  const [deleteTarget,  setDeleteTarget]  = useState<GovRegister | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/governance/registers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc || null }),
    });
    const res = await fetch("/api/governance/registers");
    setRegisters(await res.json());
    setShowModal(false); setName(""); setDesc(""); setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError(null);
    const res = await fetch(`/api/governance/registers/${deleteTarget.registerId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setDeleteError((await res?.json().catch(() => ({})))?.error ?? r.deleteFailed);
      setDeleting(false);
      return;
    }
    setRegisters((p) => p.filter((reg) => reg.registerId !== deleteTarget.registerId));
    // Refresh archived list
    const archived = await fetch("/api/governance/registers/archived").then((r) => r.json());
    setDeletedRegisters(archived);
    setDeleteTarget(null);
    setDeleting(false);
  }

  async function restore(reg: GovRegister) {
    await fetch(`/api/governance/registers/${reg.registerId}/restore`, { method: "POST" });
    setDeletedRegisters((p) => p.filter((r) => r.registerId !== reg.registerId));
    const active = await fetch("/api/governance/registers").then((r) => r.json());
    setRegisters(active);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-deep">{r.pageTitle}</h1>
          <p className="text-sm text-ink-soft mt-0.5">{registers.length} {r.pageTitle.toLowerCase()}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary">{r.newRegister}</button>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {registers.map((reg) => (
          <div key={reg.registerId} className="card p-5 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-bold text-brand-deep text-sm leading-snug">{reg.name}</h3>
              {reg.isSystem && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-brand-purple/10 text-brand-purple rounded shrink-0 ml-2">{r.systemBadge}</span>
              )}
            </div>
            {reg.description && <p className="text-[12px] text-muted mb-3 flex-1">{reg.description}</p>}
            <div className="flex items-center gap-3 text-[11px] text-muted mb-4">
              <span>{reg.columnCount} {r.columns}</span>
              <span>·</span>
              <span>{reg.entryCount} {r.entries}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/governance/registers/${reg.registerId}`} className="btn btn-primary btn-sm flex-1 text-center">
                {r.open}
              </Link>
              {isAdmin && (
                <button
                  onClick={() => { setDeleteError(null); setDeleteTarget(reg); }}
                  className="btn btn-sm text-red-500 hover:border-red-300"
                >
                  {t.common.delete}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Archived registers (admin only) */}
      {isAdmin && deletedRegisters.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setShowArchived((p) => !p)}
            className="flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-brand-deep mb-4"
          >
            <span className={`transition-transform ${showArchived ? "rotate-90" : ""}`}>▶</span>
            {r.archivedHeading.replace("{n}", String(deletedRegisters.length))}
          </button>
          {showArchived && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas-soft border-b border-line text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">{r.nameCol}</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">{r.archivedBy}</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">{r.archivedAt}</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">{r.tabEntries}</th>
                    <th className="px-4 py-2.5 w-32" />
                  </tr>
                </thead>
                <tbody>
                  {deletedRegisters.map((reg) => (
                    <tr key={reg.registerId} className="border-b border-line-soft hover:bg-canvas/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink">{reg.name}</div>
                        {reg.description && <div className="text-[11px] text-muted truncate max-w-[240px]">{reg.description}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-ink-soft">{reg.deletedBy ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[12px] text-muted">{reg.deletedAt ? fmtDate(reg.deletedAt) : "—"}</td>
                      <td className="px-4 py-2.5 text-[12px] text-muted">{reg.entryCount}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          <Link
                            href={`/governance/registers/${reg.registerId}`}
                            className="text-[11px] text-brand-purple hover:text-brand-deep font-semibold"
                          >
                            {r.auditView}
                          </Link>
                          <button
                            onClick={() => restore(reg)}
                            className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold"
                          >
                            {r.restore}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create register */}
      {showModal && (
        <FormDialog
          title={r.newRegisterModal} width="w-[520px]" onClose={() => setShowModal(false)}
          footer={<>
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={create} disabled={saving || !name.trim()} className="btn btn-primary btn-sm">
              {saving ? r.creating : t.common.add}
            </button>
          </>}
        >
          <FormField label={r.registerNameLabel.replace(/\s*\*\s*$/, "")} required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder={r.registerNamePlaceholder} autoFocus />
          </FormField>
          <FormField label={t.common.description}>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="field" />
          </FormField>
        </FormDialog>
      )}

      {/* Delete confirmation. The register is kept and can be restored (it is archived, not erased). */}
      {deleteTarget && (
        <FormDialog
          title={r.archiveTitle} width="w-[520px]" onClose={() => { if (!deleting) setDeleteTarget(null); }}
          footer={<>
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="btn btn-sm">{t.common.cancel}</button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="btn btn-sm bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white hover:border-red-700">
              {deleting ? r.archiving : r.archiveConfirm}
            </button>
          </>}
        >
          <p className="text-sm text-ink">{r.archiveIntro.replace("{name}", deleteTarget.name)}</p>
          {deleteTarget.isSystem && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{r.archiveSystemNote}</p>
          )}
          <div className="bg-canvas-soft border border-line rounded-lg px-4 py-3 text-ink-soft">
            <p className="font-semibold text-ink mb-1 text-[13px]">{r.archiveWhat}</p>
            <ul className="list-disc list-inside space-y-0.5 text-[12px]">
              <li>{r.archiveKept.replace("{n}", String(deleteTarget.entryCount))}</li>
              <li>{r.archiveHidden}</li>
              <li>{r.archiveAudit}</li>
              <li>{r.archiveRestore}</li>
            </ul>
          </div>
          {deleteError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{deleteError}</p>}
        </FormDialog>
      )}
    </div>
  );
}
