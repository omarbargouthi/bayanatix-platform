"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssetPickerItem } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type BreadcrumbEntry = {
  label:    string;
  level:    string;
  parentId: string;
  path:     string;       // accumulated display path for token
  // IDs needed to build the final token URL
  sourceId?:  string;
  schemaId?:  string;
  entityId?:  string;
};

type UserItem = { id: string; label: string; role: string };

interface Props {
  query:     string;               // text typed after #
  onSelect:  (token: string) => void;
  onClose:   () => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function buildAssetToken(
  item: AssetPickerItem,
  breadcrumb: BreadcrumbEntry[],
): string {
  const parent  = breadcrumb[breadcrumb.length - 1];
  const path    = parent ? `${parent.path} > ${item.label}` : item.label;
  const sourceId  = parent?.sourceId  ?? (item.assetType === "DATA_SOURCE" ? item.id : "");
  const schemaId  = parent?.schemaId  ?? (item.assetType === "SCHEMA"      ? item.id : "");
  const entityId  = parent?.entityId  ?? (item.assetType === "TABLE"       ? item.id : "");

  let assetId = item.id;
  if (item.assetType === "TABLE")  assetId = `${item.id}:${schemaId}`;
  if (item.assetType === "COLUMN") assetId = `${item.id}:${entityId}:${schemaId}`;

  return `#asset[${path}|${item.assetType}|${assetId}]`;
}

// ── Root options ──────────────────────────────────────────────────────────────

const ROOTS = [
  { id: "data",     label: "Data Assets",       icon: "🗄", nextLevel: "sources" },
  { id: "glossary", label: "Business Glossary",  icon: "📖", nextLevel: "glossary_domains" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function MentionPicker({ query, onSelect, onClose }: Props) {
  const [tab,        setTab]        = useState<"assets" | "users">("assets");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);
  const [items,      setItems]      = useState<AssetPickerItem[] | null>(null);
  const [users,      setUsers]      = useState<UserItem[] | null>(null);
  const [filter,     setFilter]     = useState(query);
  const [loading,    setLoading]    = useState(false);

  // Auto-switch to users tab when user types "#user." or "#user "
  useEffect(() => {
    if (query.startsWith("user.") || query === "user") {
      setTab("users");
      setFilter(query.startsWith("user.") ? query.slice(5) : "");
    } else {
      setFilter(query);
    }
  }, [query]);

  // Fetch asset items when breadcrumb changes
  const currentLevel = breadcrumb[breadcrumb.length - 1];
  useEffect(() => {
    if (tab !== "assets") return;
    if (breadcrumb.length === 0) { setItems(null); return; }

    const level    = currentLevel.level;
    const parentId = currentLevel.parentId;
    setLoading(true);
    fetch(`/api/collab/assets?level=${level}&parentId=${parentId}`)
      .then((r) => r.json())
      .then((data: AssetPickerItem[]) => { setItems(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [breadcrumb, tab, currentLevel]);

  // Fetch users
  useEffect(() => {
    if (tab !== "users") return;
    setLoading(true);
    fetch(`/api/collab/assets?level=users&q=${encodeURIComponent(filter)}`)
      .then((r) => r.json())
      .then((data: UserItem[]) => { setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab, filter]);

  function drillInto(item: AssetPickerItem) {
    const parent = breadcrumb[breadcrumb.length - 1];
    const path   = parent ? `${parent.path} > ${item.label}` : item.label;

    let nextLevel = "";
    if (item.assetType === "DATA_SOURCE")    nextLevel = "schemas";
    if (item.assetType === "SCHEMA")         nextLevel = "tables";
    if (item.assetType === "TABLE")          nextLevel = "columns";
    if (item.assetType === "GLOSSARY_DOMAIN") nextLevel = "glossary_terms";

    setBreadcrumb((prev) => [
      ...prev,
      {
        label: item.label,
        level: nextLevel,
        parentId: item.id,
        path,
        sourceId: item.assetType === "DATA_SOURCE" ? item.id : parent?.sourceId,
        schemaId: item.assetType === "SCHEMA"       ? item.id : parent?.schemaId,
        entityId: item.assetType === "TABLE"        ? item.id : parent?.entityId,
      },
    ]);
  }

  function selectAsset(item: AssetPickerItem) {
    onSelect(buildAssetToken(item, breadcrumb));
  }

  function selectUser(u: UserItem) {
    onSelect(`#user[${u.id}|${u.label}]`);
  }

  function goBack(idx: number) {
    setBreadcrumb((prev) => prev.slice(0, idx));
    setItems(null);
  }

  const displayItems = (items ?? []).filter((it) =>
    !filter || it.label.toLowerCase().includes(filter.toLowerCase())
  );
  const displayUsers = (users ?? []).filter((u) =>
    !filter || u.label.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 z-50 bg-white rounded-xl border border-line shadow-xl overflow-hidden"
      style={{ maxHeight: 340 }}>

      {/* Header: tabs + filter */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-line-soft">
        <button onClick={() => setTab("assets")}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${
            tab === "assets" ? "bg-teal-100 text-teal-700" : "text-muted hover:text-ink"}`}>
          🗄 Assets
        </button>
        <button onClick={() => setTab("users")}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${
            tab === "users" ? "bg-brand-purple/15 text-brand-purple" : "text-muted hover:text-ink"}`}>
          👤 Users
        </button>
        <input
          autoFocus
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 text-sm border-none outline-none bg-transparent text-ink placeholder:text-muted"
        />
        <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">&times;</button>
      </div>

      {/* Breadcrumb */}
      {tab === "assets" && breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 text-[11px] bg-canvas-soft border-b border-line-soft overflow-x-auto">
          <button onClick={() => goBack(0)} className="text-brand-purple font-semibold hover:underline">Root</button>
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-muted">/</span>
              <button onClick={() => goBack(i + 1)} className="text-brand-purple font-semibold hover:underline truncate max-w-[120px]">{b.label}</button>
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {loading && (
          <div className="py-6 text-center text-muted text-sm">Loading…</div>
        )}

        {/* Assets: root level */}
        {tab === "assets" && !loading && breadcrumb.length === 0 && (
          <div>
            {ROOTS.map((r) => (
              <button key={r.id} onClick={() => {
                setBreadcrumb([{ label: r.label, level: r.nextLevel, parentId: "", path: r.label }]);
              }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas-soft text-left transition-colors">
                <span className="text-base">{r.icon}</span>
                <span className="font-medium">{r.label}</span>
                <span className="ml-auto text-muted">›</span>
              </button>
            ))}
          </div>
        )}

        {/* Assets: drill-down level */}
        {tab === "assets" && !loading && breadcrumb.length > 0 && (
          <div>
            {displayItems.length === 0 && (
              <div className="py-6 text-center text-muted text-sm">No items found.</div>
            )}
            {displayItems.map((item) => (
              <div key={item.id}
                className="flex items-center gap-2 px-4 py-2 hover:bg-canvas-soft transition-colors group">
                <button onClick={() => selectAsset(item)}
                  className="flex-1 text-left text-sm font-medium text-ink truncate">
                  {item.label}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => selectAsset(item)}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 hover:bg-teal-200">
                    Select
                  </button>
                  {item.hasChildren && (
                    <button onClick={() => drillInto(item)}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-canvas border border-line text-muted hover:text-ink">
                      ›
                    </button>
                  )}
                </div>
                {item.hasChildren && (
                  <span className="text-muted text-xs opacity-60 group-hover:hidden">›</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Users */}
        {tab === "users" && !loading && (
          <div>
            {displayUsers.length === 0 && (
              <div className="py-6 text-center text-muted text-sm">No users found.</div>
            )}
            {displayUsers.map((u) => (
              <button key={u.id} onClick={() => selectUser(u)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-soft text-left transition-colors">
                <span className="w-7 h-7 rounded-full bg-brand-purple/15 text-brand-purple text-[11px] font-bold grid place-items-center shrink-0">
                  {u.label.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <div>
                  <div className="text-sm font-medium">{u.label}</div>
                  <div className="text-[10px] text-muted">{u.role}</div>
                </div>
                <span className="ml-auto text-[10px] text-muted">@{u.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-line-soft bg-canvas-soft text-[10px] text-muted">
        Type <kbd className="border border-line rounded px-1">#</kbd> for assets &nbsp;·&nbsp;
        <kbd className="border border-line rounded px-1">#user.</kbd> for people &nbsp;·&nbsp;
        <kbd className="border border-line rounded px-1">Esc</kbd> to dismiss
      </div>
    </div>
  );
}
