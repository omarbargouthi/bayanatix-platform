"use client";

import { useState, useEffect, useCallback } from "react";
import { UserSearchPicker } from "./UserSearchPicker";
import { useLang } from "@/lib/lang-context";
import { pickTranslation } from "@/lib/i18n-admin/translated-column";

export type GovernanceRoleLabel = { roleCode: string; name: string; description: string | null; nameTranslations: Record<string, string> | null };

export type Stakeholder = {
  assignmentId: number;
  userId:       string;
  fullName:     string | null;
  email:        string | null;
  roleCode:     string;
  roleName:     string | null;
  assignedAt:   string;
};

export type EffectiveStakeholder = {
  userId:       string;
  fullName:     string | null;
  email:        string | null;
  roleCode:     string;
  roleName:     string | null;
  resolvedFrom: "COLUMN" | "TABLE" | "SCHEMA" | "SOURCE";
};

type UserResult = { userId: string; fullName: string | null; email: string };

const ROLE_BADGE: Record<string, string> = {
  OWNER:        "bg-amber-100 text-amber-700",
  BIZ_STEWARD:  "bg-blue-100 text-blue-700",
  TECH_STEWARD: "bg-violet-100 text-violet-700",
};

// Which asset type this level's stakeholders live under, and the label used to
// describe where an inherited value actually came from (matches the SQL
// resolver functions' RETURN VALUES — db/046_governance_ownership.sql,
// db/097_schema_governance_resolver.sql).
const LEVEL_BY_ASSET_TYPE: Record<string, "SOURCE" | "SCHEMA" | "TABLE" | "COLUMN"> = {
  DATA_SOURCES:   "SOURCE",
  DATA_SCHEMAS:   "SCHEMA",
  DATA_ENTITIES:  "TABLE",
  DATA_ATTRIBUTES:"COLUMN",
};

const LEVEL_LABEL: Record<string, string> = {
  SOURCE: "Source", SCHEMA: "Schema", TABLE: "Table", COLUMN: "Column",
};

// Only these asset types have a resolver behind ?effective=true (see
// app/api/catalog/stakeholders/route.ts) — anything else (DATA_SOURCES itself,
// the root of the hierarchy, or a CUSTOM:* asset type) has no parent to
// inherit from, so skip that fetch rather than misreading its raw-list fallback.
const EFFECTIVE_SUPPORTED = new Set(["DATA_SCHEMAS", "DATA_ENTITIES", "DATA_ATTRIBUTES"]);

function initials(s: { fullName: string | null; userId: string }) {
  if (!s.fullName) return s.userId.slice(0, 2).toUpperCase();
  const parts = s.fullName.trim().split(" ");
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type Props = {
  assetType: string;
  assetId:   number;
  canEdit:   boolean;
};

export function GovernancePanel({ assetType, assetId, canEdit }: Props) {
  const { lookupLabel, t, lang } = useLang();
  const g = t.catalog;
  const thisLevel = LEVEL_BY_ASSET_TYPE[assetType] ?? "TABLE";

  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [effective,    setEffective]    = useState<EffectiveStakeholder[]>([]);
  const [roleLabels,   setRoleLabels]   = useState<GovernanceRoleLabel[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [editing,      setEditing]      = useState(false);
  const [addingCode,   setAddingCode]   = useState<string | null>(null);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ownP  = fetch(`/api/catalog/stakeholders?assetType=${assetType}&assetId=${assetId}`).then((r) => r.ok ? r.json() : []);
      const effP  = EFFECTIVE_SUPPORTED.has(assetType)
        ? fetch(`/api/catalog/stakeholders?assetType=${assetType}&assetId=${assetId}&effective=true`).then((r) => r.ok ? r.json() : [])
        : Promise.resolve<EffectiveStakeholder[]>([]);
      const rolesP = fetch("/api/admin/governance-roles").then((r) => r.ok ? r.json() : []);
      const [own, eff, roles] = await Promise.all([ownP, effP, rolesP]);
      setStakeholders(own);
      setEffective(eff);
      setRoleLabels(roles);
    } finally {
      setLoading(false);
    }
  }, [assetType, assetId]);

  useEffect(() => { void load(); }, [load]);

  const roleLabel = (roleCode: string, fallbackName: string) =>
    lookupLabel("GOVERNANCE_ROLE", roleCode) ||
    (() => {
      const r = roleLabels.find((rl) => rl.roleCode === roleCode);
      return r ? pickTranslation(r.name, r.nameTranslations, lang) : fallbackName;
    })();

  const GROUPS = [
    { roleCode: "OWNER",        label: roleLabel("OWNER", "Owner"),                   singular: true  },
    { roleCode: "BIZ_STEWARD",  label: roleLabel("BIZ_STEWARD", "Business Steward"),  singular: false },
    { roleCode: "TECH_STEWARD", label: roleLabel("TECH_STEWARD", "Technical Steward"),singular: false },
  ];

  async function handleAdd(roleCode: string, user: UserResult) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/catalog/stakeholders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ assetTypeCode: assetType, assetId, userId: user.userId, roleCode }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Failed"); return; }
      setAddingCode(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(s: Stakeholder) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/catalog/stakeholders/${s.assignmentId}`, { method: "DELETE" });
      if (!r.ok) { setError("Failed to remove"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5 mt-5">
        <h3 className="font-bold text-sm mb-3">{g.governanceRoles}</h3>
        <div className="text-[13px] text-muted">Loading…</div>
      </div>
    );
  }

  const hasAnyOwn       = stakeholders.length > 0;
  const hasAnyInherited = effective.length > 0;
  const hasAny          = hasAnyOwn || hasAnyInherited;

  return (
    <div className="card p-5 mt-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm">{g.governanceRoles}</h3>
        {canEdit && (
          <button
            onClick={() => { setEditing((v) => !v); setAddingCode(null); setError(null); }}
            className="btn btn-sm"
          >
            {editing ? g.doneEditing : g.editRoles}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!hasAny && !editing && (
        <p className="text-[13px] text-muted italic">{g.noRolesAssigned}</p>
      )}

      <div className="grid gap-5 grid-cols-3">
        {GROUPS.map((group) => {
          const members        = stakeholders.filter((s) => s.roleCode === group.roleCode);
          const inheritedMembers = members.length === 0
            ? effective.filter((e) => e.roleCode === group.roleCode)
            : [];
          const isAdding    = addingCode === group.roleCode;
          const canAddMore  = !group.singular || members.length === 0;

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
                    {isAdding ? "Cancel" : inheritedMembers.length > 0 ? "Override" : "+ Add"}
                  </button>
                )}
              </div>

              {/* Members */}
              {members.length === 0 && inheritedMembers.length === 0 && !isAdding && (
                <div className="text-[12px] text-muted italic">{g.noneAssigned}</div>
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

                {/* Inherited (no own-level assignment at this level) */}
                {inheritedMembers.map((s) => (
                  <div key={`inherited-${s.userId}`} className="flex items-center gap-2 opacity-70" title={`Inherited from ${LEVEL_LABEL[s.resolvedFrom]} — not explicitly set at ${LEVEL_LABEL[thisLevel]} level`}>
                    <div className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 border-2 border-dashed border-current ${ROLE_BADGE[s.roleCode] ?? "bg-gray-100 text-gray-600"}`}>
                      {initials(s)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-ink leading-tight truncate">
                        {s.fullName ?? s.userId}
                      </div>
                      <div className="text-[10px] text-muted truncate italic">Inherited from {LEVEL_LABEL[s.resolvedFrom]}</div>
                    </div>
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
