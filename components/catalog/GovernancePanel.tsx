"use client";

import { useState } from "react";
import { UserSearchPicker } from "./UserSearchPicker";

export type GovernanceRoleLabels = {
  OWNER:       { name: string; description: string | null };
  BIZ_STEWARD: { name: string; description: string | null };
  TECH_STEWARD:{ name: string; description: string | null };
};

export type Stakeholder = {
  assignmentId: number;
  userId:       string;
  fullName:     string | null;
  email:        string | null;
  roleCode:     string;
  roleName:     string | null;
  assignedAt:   string;
};

type UserResult = { userId: string; fullName: string | null; email: string };

const ROLE_BADGE: Record<string, string> = {
  OWNER:        "bg-amber-100 text-amber-700",
  BIZ_STEWARD:  "bg-blue-100 text-blue-700",
  TECH_STEWARD: "bg-violet-100 text-violet-700",
};

function initials(s: Stakeholder) {
  if (!s.fullName) return s.userId.slice(0, 2).toUpperCase();
  const parts = s.fullName.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Props = {
  assetTypeCode:       string;
  assetId:             number;
  initialStakeholders: Stakeholder[];
  canEdit:             boolean;
  roleLabels:          GovernanceRoleLabels;
};

export function GovernancePanel({ assetTypeCode, assetId, initialStakeholders, canEdit, roleLabels }: Props) {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(initialStakeholders);
  const [editing,      setEditing]      = useState(false);
  const [addingCode,   setAddingCode]   = useState<string | null>(null);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Role groups derive their display labels from roleLabels prop
  const GROUPS = [
    { roleCode: "OWNER",        label: roleLabels.OWNER.name,        singular: true  },
    { roleCode: "BIZ_STEWARD",  label: roleLabels.BIZ_STEWARD.name,  singular: false },
    { roleCode: "TECH_STEWARD", label: roleLabels.TECH_STEWARD.name, singular: false },
  ];

  async function handleAdd(roleCode: string, user: UserResult) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/catalog/stakeholders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ assetTypeCode, assetId, userId: user.userId, roleCode }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Failed"); return; }
      const { assignmentId } = await r.json();

      if (roleCode === "OWNER") {
        setStakeholders((prev) => prev.filter((s) => s.roleCode !== "OWNER"));
      }

      const newEntry: Stakeholder = {
        assignmentId,
        userId:    user.userId,
        fullName:  user.fullName,
        email:     user.email,
        roleCode,
        roleName:  null,
        assignedAt: new Date().toISOString(),
      };
      setStakeholders((prev) => [...prev.filter((s) => !(s.userId === user.userId && s.roleCode === roleCode)), newEntry]);
      setAddingCode(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(s: Stakeholder) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/catalog/stakeholders/${s.assignmentId}`, { method: "DELETE" });
      if (!r.ok) { setError("Failed to remove"); return; }
      setStakeholders((prev) => prev.filter((x) => x.assignmentId !== s.assignmentId));
    } finally {
      setBusy(false);
    }
  }

  const hasAny = stakeholders.length > 0;

  return (
    <div className="card p-5 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">Governance Roles</h3>
        {canEdit && (
          <button
            onClick={() => { setEditing((v) => !v); setAddingCode(null); setError(null); }}
            className="btn btn-sm"
          >
            {editing ? "Done" : "Edit Roles"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!hasAny && !editing && (
        <p className="text-[13px] text-muted italic">No governance roles assigned yet.</p>
      )}

      <div className={`grid gap-5 ${editing ? "grid-cols-3" : "grid-cols-3"}`}>
        {GROUPS.map((group) => {
          const members    = stakeholders.filter((s) => s.roleCode === group.roleCode);
          const isAdding   = addingCode === group.roleCode;
          const canAddMore = !group.singular || members.length === 0;

          return (
            <div key={group.roleCode}>
              {/* Section header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {group.label}
                </span>
                {editing && canAddMore && (
                  <button
                    onClick={() => setAddingCode(isAdding ? null : group.roleCode)}
                    className="text-[11px] text-brand-purple hover:underline font-medium"
                  >
                    {isAdding ? "Cancel" : "+ Add"}
                  </button>
                )}
              </div>

              {/* Members */}
              {members.length === 0 && !isAdding && (
                <div className="text-[12px] text-muted italic">None assigned</div>
              )}

              <div className="space-y-2">
                {members.map((s) => (
                  <div key={s.assignmentId} className="flex items-center gap-2 group">
                    <div className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${ROLE_BADGE[s.roleCode] ?? "bg-gray-100 text-gray-600"}`}>
                      {initials(s)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink leading-tight truncate">
                        {s.fullName ?? s.userId}
                      </div>
                      {s.email && (
                        <div className="text-[10px] text-muted truncate">{s.email}</div>
                      )}
                    </div>
                    {editing && (
                      <button
                        onClick={() => handleRemove(s)}
                        disabled={busy}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center text-[11px] shrink-0 transition-opacity disabled:opacity-50"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {/* Inline search picker */}
                {isAdding && (
                  <div className="pt-1">
                    <UserSearchPicker
                      placeholder={`Search ${group.label.toLowerCase()}…`}
                      excludeIds={members.map((m) => m.userId)}
                      onSelect={(u) => handleAdd(group.roleCode, u)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
