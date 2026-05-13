"use client";

import { useState } from "react";
import { UserSearchPicker } from "./UserSearchPicker";

type Stakeholder = {
  assignmentId: number;
  userId:       string;
  fullName:     string | null;
  email:        string | null;
  roleCode:     string;
  roleName:     string | null;
  assignedAt:   string;
};

type UserResult = { userId: string; fullName: string | null; email: string };

// Role groups shown in the panel
const ROLE_GROUPS = [
  {
    label:     "Owner",
    codes:     ["OWNER"],
    addCode:   "OWNER",
    singular:  true,
    desc:      "Accountable owner of this asset",
  },
  {
    label:     "Stewards",
    codes:     ["BIZ_STEWARD", "TECH_STEWARD"],
    addCode:   "BIZ_STEWARD",
    singular:  false,
    desc:      "Responsible for definitions, quality, and policies",
  },
  {
    label:     "Custodians",
    codes:     ["CUSTODIAN"],
    addCode:   "CUSTODIAN",
    singular:  false,
    desc:      "Responsible for storage, security, and lifecycle",
  },
] as const;

const ROLE_BADGE: Record<string, string> = {
  OWNER:        "bg-amber-100 text-amber-700",
  BIZ_STEWARD:  "bg-blue-100 text-blue-700",
  TECH_STEWARD: "bg-violet-100 text-violet-700",
  CUSTODIAN:    "bg-teal-100 text-teal-700",
};

const ROLE_SHORT: Record<string, string> = {
  OWNER:        "Owner",
  BIZ_STEWARD:  "Biz",
  TECH_STEWARD: "Tech",
  CUSTODIAN:    "Custodian",
};

function initials(s: Stakeholder) {
  if (!s.fullName) return s.userId.slice(0, 2).toUpperCase();
  const parts = s.fullName.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Props = {
  assetTypeCode:        string;
  assetId:              number;
  initialStakeholders:  Stakeholder[];
  canEdit:              boolean;
};

export function GovernancePanel({ assetTypeCode, assetId, initialStakeholders, canEdit }: Props) {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(initialStakeholders);
  const [editing,      setEditing]      = useState(false);
  const [adding,       setAdding]       = useState<string | null>(null); // which group's addCode is open
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleAdd(addCode: string, user: UserResult) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/catalog/stakeholders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ assetTypeCode, assetId, userId: user.userId, roleCode: addCode }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Failed"); return; }
      const { assignmentId } = await r.json();

      // If owner, remove existing owner from local state first
      if (addCode === "OWNER") {
        setStakeholders((prev) => prev.filter((s) => s.roleCode !== "OWNER"));
      }

      const newEntry: Stakeholder = {
        assignmentId,
        userId:    user.userId,
        fullName:  user.fullName,
        email:     user.email,
        roleCode:  addCode,
        roleName:  null,
        assignedAt: new Date().toISOString(),
      };
      setStakeholders((prev) => [...prev.filter((s) => !(s.userId === user.userId && s.roleCode === addCode)), newEntry]);
      setAdding(null);
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

  return (
    <div className="card p-5 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">Governance Roles</h3>
        {canEdit && (
          <button
            onClick={() => { setEditing((v) => !v); setAdding(null); setError(null); }}
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

      <div className="grid grid-cols-3 gap-4">
        {ROLE_GROUPS.map((group) => {
          const members = stakeholders.filter((s) => (group.codes as readonly string[]).includes(s.roleCode));
          const allIds  = stakeholders.map((s) => s.userId);
          const isAddingHere = adding === group.addCode;

          return (
            <div key={group.label} className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label}</span>
                {editing && !(group.singular && members.length > 0) && (
                  <button
                    onClick={() => setAdding(isAddingHere ? null : group.addCode)}
                    className="ml-auto text-[11px] text-brand-purple hover:underline font-medium"
                  >
                    {isAddingHere ? "Cancel" : "+ Add"}
                  </button>
                )}
              </div>

              {/* Existing members */}
              {members.length === 0 && !isAddingHere && (
                <div className="text-[12px] text-muted italic py-1">None assigned</div>
              )}
              {members.map((s) => (
                <div key={s.assignmentId} className="flex items-center gap-2 group">
                  <div className="w-7 h-7 rounded-full bg-brand-purple/10 text-brand-purple text-[11px] font-bold flex items-center justify-center shrink-0">
                    {initials(s)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink leading-tight truncate">
                      {s.fullName ?? s.userId}
                    </div>
                    {s.roleCode !== group.addCode && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[s.roleCode] ?? "bg-gray-100 text-gray-600"}`}>
                        {ROLE_SHORT[s.roleCode] ?? s.roleCode}
                      </span>
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

              {/* Inline user search picker */}
              {isAddingHere && (
                <div className="pt-1">
                  <UserSearchPicker
                    placeholder={`Search ${group.label.toLowerCase()}…`}
                    excludeIds={group.singular ? allIds : members.map((m) => m.userId)}
                    onSelect={(u) => handleAdd(group.addCode, u)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
