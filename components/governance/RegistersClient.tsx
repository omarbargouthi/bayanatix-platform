"use client";

import { useState } from "react";
import Link from "next/link";
import type { GovRegister } from "@/lib/queries/gov-registers";
import { useLang } from "@/lib/lang-context";

export function RegistersClient({ initialRegisters }: { initialRegisters: GovRegister[] }) {
  const { t } = useLang();
  const r = t.registers;

  const [registers, setRegisters] = useState<GovRegister[]>(initialRegisters);
  const [showModal, setShowModal] = useState(false);
  const [name, setName]           = useState("");
  const [desc, setDesc]           = useState("");
  const [saving, setSaving]       = useState(false);

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

  async function del(id: number) {
    if (!confirm(r.deleteRegisterConfirm)) return;
    await fetch(`/api/governance/registers/${id}`, { method: "DELETE" });
    setRegisters((p) => p.filter((reg) => reg.registerId !== id));
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
              {!reg.isSystem && (
                <button onClick={() => del(reg.registerId)} className="btn btn-sm text-red-500 hover:border-red-300">{t.common.delete}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{r.newRegisterModal}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">{r.registerNameLabel}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="e.g. Risk Register" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-ink-soft mb-1">{t.common.description}</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="field" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn btn-sm">{t.common.cancel}</button>
              <button onClick={create} disabled={saving || !name.trim()} className="btn btn-primary btn-sm">
                {saving ? r.creating : t.common.add}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
