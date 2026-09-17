"use client";

import { useState, useEffect, useCallback } from "react";
import { UserSearchPicker } from "@/components/catalog/UserSearchPicker";

type Person = { userId: string; fullName: string | null; email: string | null };
type OwnSteward = Person & { stewardId: number };
type Effective = Person & { resolvedFromId: number; resolvedFromName: string | null };

type Governance = {
  glossaryId: number;
  isRoot: boolean;
  ownOwnerUserId: string | null;
  ownStewards: OwnSteward[];
  effectiveOwner: (Effective & { isOwn: boolean }) | null;
  effectiveStewards: Effective[];
  pendingRequestId: number | null;
};

function initials(p: Person) {
  if (!p.fullName) return p.userId.slice(0, 2).toUpperCase();
  const parts = p.fullName.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function GlossaryGovernancePanel({
  glossaryId,
  kind,
  canEdit,
}: {
  glossaryId: number;
  kind:       "domain" | "term";
  canEdit:    boolean;
}) {
  const baseUrl = `/api/glossary/${kind === "domain" ? "domains" : "terms"}/${glossaryId}/ownership`;

  const [gov,     setGov]     = useState<Governance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  // Root-domain direct edit
  const [editingOwner, setEditingOwner] = useState(false);
  const [addingSteward, setAddingSteward] = useState(false);

  // Non-root override proposal
  const [showOverride, setShowOverride] = useState(false);
  const [proposedOwner, setProposedOwner] = useState<Person | null>(null);
  const [proposedStewards, setProposedStewards] = useState<Person[]>([]);
  const [justification, setJustification] = useState("");
  const [addingProposedSteward, setAddingProposedSteward] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(baseUrl);
      if (r.ok) setGov(await r.json());
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => { void load(); }, [load]);

  async function setOwnerDirect(userId: string | null) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(baseUrl, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUserId: userId }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Failed"); return; }
      setEditingOwner(false);
      await load();
    } finally { setBusy(false); }
  }

  async function addStewardDirect(userId: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(baseUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Failed"); return; }
      setAddingSteward(false);
      await load();
    } finally { setBusy(false); }
  }

  async function removeStewardDirect(stewardId: number) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${baseUrl}?stewardId=${stewardId}`, { method: "DELETE" });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Failed"); return; }
      await load();
    } finally { setBusy(false); }
  }

  function openOverrideForm() {
    setProposedOwner(gov?.effectiveOwner ? { userId: gov.effectiveOwner.userId, fullName: gov.effectiveOwner.fullName, email: gov.effectiveOwner.email } : null);
    setProposedStewards(gov?.effectiveStewards.map((s) => ({ userId: s.userId, fullName: s.fullName, email: s.email })) ?? []);
    setJustification("");
    setShowOverride(true);
  }

  async function submitOverride() {
    if (!justification.trim()) { setError("Justification is required."); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${baseUrl}/override`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedOwnerId: proposedOwner?.userId ?? null,
          proposedStewardIds: proposedStewards.map((s) => s.userId),
          justification: justification.trim(),
        }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Failed"); return; }
      setShowOverride(false);
      await load();
    } finally { setBusy(false); }
  }

  if (loading || !gov) {
    return (
      <div className="card p-5">
        <h3 className="font-bold text-sm mb-3">Governance</h3>
        <div className="text-[13px] text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">Governance</h3>
        {canEdit && gov.pendingRequestId && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Override pending DMO approval
          </span>
        )}
        {canEdit && !gov.pendingRequestId && !gov.isRoot && (
          <button onClick={openOverrideForm} className="text-[11px] text-brand-purple hover:underline font-medium">
            Propose Override
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Owner */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Owner</span>
            {canEdit && gov.isRoot && (
              <button onClick={() => setEditingOwner((v) => !v)} className="text-[11px] text-brand-purple hover:underline font-medium">
                {editingOwner ? "Cancel" : gov.effectiveOwner ? "Change" : "+ Set"}
              </button>
            )}
          </div>
          {gov.effectiveOwner ? (
            <div className={`flex items-center gap-2 ${gov.effectiveOwner.isOwn ? "" : "opacity-70"}`}>
              <div className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 bg-amber-100 text-amber-700 ${gov.effectiveOwner.isOwn ? "" : "border-2 border-dashed border-current"}`}>
                {initials(gov.effectiveOwner)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink leading-tight truncate">{gov.effectiveOwner.fullName ?? gov.effectiveOwner.userId}</div>
                {gov.effectiveOwner.isOwn
                  ? <div className="text-[10px] text-muted truncate">{gov.effectiveOwner.email}</div>
                  : <div className="text-[10px] text-muted truncate italic">Inherited from {gov.effectiveOwner.resolvedFromName}</div>}
              </div>
              {canEdit && gov.isRoot && (
                <button onClick={() => setOwnerDirect(null)} disabled={busy} className="text-[11px] text-red-500 hover:underline shrink-0">Clear</button>
              )}
            </div>
          ) : (
            <div className="text-[12px] text-muted italic">None assigned</div>
          )}
          {editingOwner && (
            <div className="mt-2">
              <UserSearchPicker placeholder="Search owner…" onSelect={(u) => setOwnerDirect(u.userId)} />
            </div>
          )}
        </div>

        {/* Stewards */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Stewards</span>
            {canEdit && gov.isRoot && (
              <button onClick={() => setAddingSteward((v) => !v)} className="text-[11px] text-brand-purple hover:underline font-medium">
                {addingSteward ? "Cancel" : "+ Add"}
              </button>
            )}
          </div>
          {gov.effectiveStewards.length === 0 ? (
            <div className="text-[12px] text-muted italic">None assigned</div>
          ) : (
            <div className="space-y-2">
              {gov.effectiveStewards.map((s) => {
                const own = gov.ownStewards.find((os) => os.userId === s.userId);
                return (
                  <div key={s.userId} className={`flex items-center gap-2 group ${own ? "" : "opacity-70"}`}>
                    <div className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 bg-violet-100 text-violet-700 ${own ? "" : "border-2 border-dashed border-current"}`}>
                      {initials(s)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink leading-tight truncate">{s.fullName ?? s.userId}</div>
                      {own
                        ? <div className="text-[10px] text-muted truncate">{s.email}</div>
                        : <div className="text-[10px] text-muted truncate italic">Inherited from {s.resolvedFromName}</div>}
                    </div>
                    {canEdit && gov.isRoot && own && (
                      <button
                        onClick={() => removeStewardDirect(own.stewardId)}
                        disabled={busy}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center text-[11px] shrink-0 transition-opacity disabled:opacity-50"
                        title="Remove"
                      >✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {addingSteward && (
            <div className="mt-2">
              <UserSearchPicker
                placeholder="Search stewards…"
                excludeIds={gov.ownStewards.map((s) => s.userId)}
                onSelect={(u) => addStewardDirect(u.userId)}
              />
            </div>
          )}
        </div>
      </div>

      {showOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setShowOverride(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-line max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
              <h2 className="font-bold text-brand-deep">Propose Governance Override</h2>
              <button onClick={() => setShowOverride(false)} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <p className="text-[12px] text-muted">
                This currently inherits its Owner/Stewards from a parent Domain. Proposing an override here requires
                sign-off from the Data Management Office before it takes effect.
              </p>
              <div>
                <label className="field-label">Owner</label>
                {proposedOwner ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
                    <span className="text-[12px] font-medium text-ink flex-1 truncate">{proposedOwner.fullName ?? proposedOwner.userId}</span>
                    <button onClick={() => setProposedOwner(null)} className="text-muted hover:text-red-500 text-sm leading-none">&times;</button>
                  </div>
                ) : (
                  <UserSearchPicker placeholder="Search owner…" onSelect={setProposedOwner} />
                )}
              </div>
              <div>
                <label className="field-label">Stewards</label>
                <div className="space-y-1.5 mb-2">
                  {proposedStewards.map((s) => (
                    <div key={s.userId} className="flex items-center gap-2 px-3 py-2 bg-canvas border border-line rounded-lg">
                      <span className="text-[12px] font-medium text-ink flex-1 truncate">{s.fullName ?? s.userId}</span>
                      <button
                        onClick={() => setProposedStewards((prev) => prev.filter((p) => p.userId !== s.userId))}
                        className="text-muted hover:text-red-500 text-sm leading-none"
                      >&times;</button>
                    </div>
                  ))}
                </div>
                {addingProposedSteward ? (
                  <UserSearchPicker
                    placeholder="Search stewards…"
                    excludeIds={proposedStewards.map((s) => s.userId)}
                    onSelect={(u) => { setProposedStewards((prev) => [...prev, u]); setAddingProposedSteward(false); }}
                  />
                ) : (
                  <button onClick={() => setAddingProposedSteward(true)} className="text-[11px] text-brand-purple hover:underline font-medium">+ Add steward</button>
                )}
              </div>
              <div>
                <label className="field-label">Justification <span className="text-red-500">*</span></label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Why does this need a different Owner/Steward than its parent Domain?"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-line shrink-0">
              <button onClick={() => setShowOverride(false)} className="btn">Cancel</button>
              <button onClick={submitOverride} disabled={busy} className="btn btn-primary">
                {busy ? "Submitting…" : "Submit for DMO Approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
